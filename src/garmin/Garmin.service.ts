import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { GarminClient } from "./Garmin.client.js";
import { ITb_garmin_intraday_metric } from "../models/databases/tb_garmin_intraday_metric.js";
import { ITb_garmin_daily_summary } from "../models/databases/tb_garmin_daily_summary.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TodayDto, DailySummaryDto, SleepDto, HighStressWindow } from "../models/dtos/GarminDto.js";
import { HeartRateValuePair } from "./Garmin.client.js";

// All three intraday feeds have gaps — heart-rate sampling has null
// readings, and stress additionally uses -1/-2 as "no data"/"rest" sentinels
// for whatever window hasn't synced from the watch yet. Either way, the most
// recent array entry can be a gap even while a real reading sits a few
// entries back, so walk backward to the most recent *valid* value rather
// than assuming the last entry has one.
function lastValid(pairs: [number, number | null][] | undefined, isValid: (v: number) => boolean): number | null {
  if (!pairs?.length) return null;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const v = pairs[i][1];
    if (v !== null && isValid(v)) return v;
  }
  return null;
}

// Each 15-min poll fetches stress/body-battery/heart-rate independently, so
// any one feed can come back null on a given poll while the others succeed.
// Same gap-handling as lastHeartRate: walk back to the most recent non-null
// value instead of trusting the very last row.
function lastNonNull(rows: ITb_garmin_intraday_metric[], field: "stress_score" | "body_battery"): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][field];
    if (v !== null) return v;
  }
  return null;
}

const HIGH_STRESS_THRESHOLD = 75;
const POLL_INTERVAL_MIN = 15; // must match the cron cadence in Garmin.scheduler.ts
const SUSTAIN_POLLS = 2; // 2 consecutive high polls == 15+ min sustained, per plan's stress-alert definition

export class GarminService {
  private readonly client: GarminClient;

  constructor(private readonly db: KnexSqlUtilities) {
    this.client = new GarminClient(db);
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private toSleepDto(dto: Awaited<ReturnType<GarminClient["getSleep"]>>["dailySleepDTO"] | undefined, restingHr: number | null | undefined): SleepDto | null {
    if (!dto) return null;
    return {
      score: dto.sleepScores?.overall?.value ?? null,
      durationMin: dto.sleepTimeSeconds != null ? Math.round(dto.sleepTimeSeconds / 60) : null,
      deepMin: dto.deepSleepSeconds != null ? Math.round(dto.deepSleepSeconds / 60) : null,
      lightMin: dto.lightSleepSeconds != null ? Math.round(dto.lightSleepSeconds / 60) : null,
      remMin: dto.remSleepSeconds != null ? Math.round(dto.remSleepSeconds / 60) : null,
      awakeMin: dto.awakeSleepSeconds != null ? Math.round(dto.awakeSleepSeconds / 60) : null,
      restingHr: restingHr ?? null,
    };
  }

  // Polled every 15 min by Garmin.scheduler.ts. Takes the latest reading
  // from each of today's stress / body battery / heart-rate feeds and
  // stores one snapshot row — each feed is fetched independently so one
  // failing (e.g. Garmin's undocumented stress/body-battery endpoints
  // changing shape) doesn't drop the others.
  async pollIntraday(): Promise<void> {
    const now = new Date();

    const [stress, bodyBattery, heartRate] = await Promise.all([
      this.client.getDailyStress(now).catch(() => null),
      this.client.getDailyBodyBattery(now).catch(() => null),
      this.client.getHeartRateSeries(now).catch(() => null),
    ]);

    // -1/-2 are Garmin's own "no data"/"rest" sentinel values, not a real stress reading
    const latestStress = lastValid(stress?.stressValuesArray, (v) => v >= 0);
    const latestBodyBattery = lastValid(bodyBattery?.bodyBatteryValuesArray, () => true);
    const latestHeartRate = lastValid(heartRate?.heartRateValues as unknown as HeartRateValuePair[] | undefined, () => true);

    await this.db.insert<Partial<ITb_garmin_intraday_metric>, ITb_garmin_intraday_metric>(
      "tb_garmin_intraday_metric",
      {
        recorded_dt: now.getTime(),
        stress_score: latestStress,
        body_battery: latestBodyBattery,
        heart_rate: latestHeartRate,
        created_dt: now.getTime(),
        record_status: "A",
      },
    );

    LoggingUtilities.service.info(
      "GarminService.pollIntraday",
      `stress=${latestStress ?? "-"} bodyBattery=${latestBodyBattery ?? "-"} hr=${latestHeartRate ?? "-"}`,
    );
  }

  // Run once daily (08:00 Asia/Singapore) by Garmin.scheduler.ts for
  // `forDate` = yesterday. A daily card is dated by its daytime activity,
  // not its sleep — so `forDate`'s intraday stress/body-battery polls are
  // rolled up together with the sleep that *followed* forDate overnight
  // (which Garmin keys under forDate+1, the wake date), both stored under
  // summary_date = forDate. Upserted so a re-run for the same date
  // overwrites rather than duplicates.
  async computeDailySummary(forDate: Date): Promise<void> {
    const dateKey = this.dateKey(forDate);
    const dayStart = this.startOfDay(forDate).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const sleepDate = new Date(dayEnd);

    const sleep = await this.client.getSleep(sleepDate).catch((err) => {
      LoggingUtilities.service.error("GarminService.computeDailySummary", `Sleep fetch failed: ${err}`);
      return null;
    });

    const rows = await this.db.find<ITb_garmin_intraday_metric>(
      "tb_garmin_intraday_metric",
      { record_status: "A" },
      {
        extraWhere: (qb) => qb.whereBetween("recorded_dt", [dayStart, dayEnd - 1]),
        orderBy: "recorded_dt",
        orderDirection: "asc",
      },
    );

    const stressValues = rows.map((r) => r.stress_score).filter((v): v is number => v !== null);
    const bodyBatteryValues = rows.map((r) => r.body_battery).filter((v): v is number => v !== null);

    const avgStress = stressValues.length
      ? Math.round(stressValues.reduce((a, b) => a + b, 0) / stressValues.length)
      : null;
    const maxStress = stressValues.length ? Math.max(...stressValues) : null;
    const minBodyBattery = bodyBatteryValues.length ? Math.min(...bodyBatteryValues) : null;

    const { windows, minutes } = this.computeHighStressWindows(rows);
    const sleepInfo = this.toSleepDto(sleep?.dailySleepDTO, sleep?.restingHeartRate);
    const now = Date.now();

    const data: Partial<ITb_garmin_daily_summary> = {
      summary_date: dateKey,
      sleep_score: sleepInfo?.score ?? null,
      sleep_duration_min: sleepInfo?.durationMin ?? null,
      deep_sleep_min: sleepInfo?.deepMin ?? null,
      light_sleep_min: sleepInfo?.lightMin ?? null,
      rem_sleep_min: sleepInfo?.remMin ?? null,
      awake_min: sleepInfo?.awakeMin ?? null,
      avg_stress: avgStress,
      max_stress: maxStress,
      high_stress_minutes: minutes,
      high_stress_windows_json: JSON.stringify(windows),
      min_body_battery: minBodyBattery,
      resting_hr: sleepInfo?.restingHr ?? null,
      updated_dt: now,
    };

    const existing = await this.db.findOne<ITb_garmin_daily_summary>("tb_garmin_daily_summary", {
      summary_date: dateKey,
    });
    if (existing) {
      await this.db.update<Partial<ITb_garmin_daily_summary>>("tb_garmin_daily_summary", { id: existing.id }, data);
    } else {
      await this.db.insert<Partial<ITb_garmin_daily_summary>, ITb_garmin_daily_summary>("tb_garmin_daily_summary", {
        ...data,
        created_dt: now,
        record_status: "A",
      });
    }
  }

  // Consecutive 15-min polls at/above the threshold count as one sustained
  // window; a single spike (one poll) doesn't qualify — matches the plan's
  // "score > 75 for 15+ min" definition at this poll cadence.
  private computeHighStressWindows(
    rows: ITb_garmin_intraday_metric[],
  ): { windows: HighStressWindow[]; minutes: number } {
    const windows: HighStressWindow[] = [];
    let runStart: number | null = null;
    let runEnd = 0;
    let runCount = 0;

    const flush = () => {
      if (runStart !== null && runCount >= SUSTAIN_POLLS) {
        windows.push({ start: runStart, end: runEnd });
      }
      runStart = null;
      runCount = 0;
    };

    for (const row of rows) {
      if (row.stress_score !== null && row.stress_score > HIGH_STRESS_THRESHOLD) {
        if (runStart === null) runStart = row.recorded_dt;
        runEnd = row.recorded_dt;
        runCount++;
      } else {
        flush();
      }
    }
    flush();

    // +POLL_INTERVAL_MIN accounts for the window's last poll covering the
    // interval *after* it, not just the span between the first and last hit.
    const minutes = windows.reduce((sum, w) => sum + Math.round((w.end - w.start) / 60000) + POLL_INTERVAL_MIN, 0);
    return { windows, minutes };
  }

  async getToday(): Promise<TodayDto> {
    const now = new Date();
    const dayStart = this.startOfDay(now).getTime();

    const rows = await this.db.find<ITb_garmin_intraday_metric>(
      "tb_garmin_intraday_metric",
      { record_status: "A" },
      { extraWhere: (qb) => qb.where("recorded_dt", ">=", dayStart), orderBy: "recorded_dt", orderDirection: "asc" },
    );

    const sleep = await this.client.getSleep(now).catch(() => null);
    const { windows } = this.computeHighStressWindows(rows);

    return {
      date: this.dateKey(now),
      sleep: this.toSleepDto(sleep?.dailySleepDTO, sleep?.restingHeartRate),
      intraday: rows.map((r) => ({
        recordedDt: r.recorded_dt,
        stressScore: r.stress_score,
        bodyBattery: r.body_battery,
        heartRate: r.heart_rate,
      })),
      currentStress: lastNonNull(rows, "stress_score"),
      currentBodyBattery: lastNonNull(rows, "body_battery"),
      highStressWindows: windows,
    };
  }

  async getSummary(days: number): Promise<DailySummaryDto[]> {
    const rows = await this.db.find<ITb_garmin_daily_summary>(
      "tb_garmin_daily_summary",
      { record_status: "A" },
      { limit: days, orderBy: "summary_date", orderDirection: "desc" },
    );
    return rows
      .map((r) => ({
        date: r.summary_date,
        sleepScore: r.sleep_score,
        sleepDurationMin: r.sleep_duration_min,
        avgStress: r.avg_stress,
        maxStress: r.max_stress,
        highStressMinutes: r.high_stress_minutes,
        minBodyBattery: r.min_body_battery,
        restingHr: r.resting_hr,
      }))
      .reverse(); // oldest → newest, ready for a trend chart
  }
}
