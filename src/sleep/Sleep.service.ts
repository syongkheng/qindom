import Anthropic from "@anthropic-ai/sdk";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_SLEEP_LOG } from "../models/databases/tb_sleep_log";
import { FeatureService } from "../feature/Feature.service";
import { Exceptions } from "../exceptions/AppExceptions";

const TB_SLEEP_LOG = "tb_sleep_log";

export interface SleepLogDto {
  id: number;
  date: string;
  source: string;
  bedtime: string | null;
  wakeTime: string | null;
  totalSleepMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  awakeMin: number | null;
  deepPct: number | null;
  lightPct: number | null;
  remPct: number | null;
  restingHrBpm: number | null;
  bodyBatteryChange: number | null;
  avgSpo2Pct: number | null;
  lowestSpo2Pct: number | null;
  avgRespirationBrpm: number | null;
  lowestRespirationBrpm: number | null;
  notes: string | null;
  createdAt: number;
}

export interface CreateSleepLogBody {
  date: string;
  source: string;
  bedtime?: string | null;
  wakeTime?: string | null;
  totalSleepMin?: number | null;
  deepMin?: number | null;
  lightMin?: number | null;
  remMin?: number | null;
  awakeMin?: number | null;
  deepPct?: number | null;
  lightPct?: number | null;
  remPct?: number | null;
  restingHrBpm?: number | null;
  bodyBatteryChange?: number | null;
  avgSpo2Pct?: number | null;
  lowestSpo2Pct?: number | null;
  avgRespirationBrpm?: number | null;
  lowestRespirationBrpm?: number | null;
  notes?: string | null;
}

export class SleepService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Mapper ──────────────────────────────────────────────────────────────────

  private mapRow(row: ITB_SLEEP_LOG): SleepLogDto {
    return {
      id:                   row.id!,
      date:                 row.date,
      source:               row.source,
      bedtime:              row.bedtime ?? null,
      wakeTime:             row.wake_time ?? null,
      totalSleepMin:        row.total_sleep_min ?? null,
      deepMin:              row.deep_min ?? null,
      lightMin:             row.light_min ?? null,
      remMin:               row.rem_min ?? null,
      awakeMin:             row.awake_min ?? null,
      deepPct:              row.deep_pct ?? null,
      lightPct:             row.light_pct ?? null,
      remPct:               row.rem_pct ?? null,
      restingHrBpm:         row.resting_hr_bpm ?? null,
      bodyBatteryChange:    row.body_battery_change ?? null,
      avgSpo2Pct:           row.avg_spo2_pct ?? null,
      lowestSpo2Pct:        row.lowest_spo2_pct ?? null,
      avgRespirationBrpm:   row.avg_respiration_brpm ?? null,
      lowestRespirationBrpm: row.lowest_respiration_brpm ?? null,
      notes:                row.notes ?? null,
      createdAt:            row.created_dt,
    };
  }

  private toRowData(body: CreateSleepLogBody): Partial<ITB_SLEEP_LOG> {
    return {
      date:                    body.date,
      source:                  body.source,
      bedtime:                 body.bedtime ?? null,
      wake_time:               body.wakeTime ?? null,
      total_sleep_min:         body.totalSleepMin ?? null,
      deep_min:                body.deepMin ?? null,
      light_min:               body.lightMin ?? null,
      rem_min:                 body.remMin ?? null,
      awake_min:               body.awakeMin ?? null,
      deep_pct:                body.deepPct ?? null,
      light_pct:               body.lightPct ?? null,
      rem_pct:                 body.remPct ?? null,
      resting_hr_bpm:          body.restingHrBpm ?? null,
      body_battery_change:     body.bodyBatteryChange ?? null,
      avg_spo2_pct:            body.avgSpo2Pct ?? null,
      lowest_spo2_pct:         body.lowestSpo2Pct ?? null,
      avg_respiration_brpm:    body.avgRespirationBrpm ?? null,
      lowest_respiration_brpm: body.lowestRespirationBrpm ?? null,
      notes:                   body.notes ?? null,
    };
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async getLogs(username: string, from?: string, to?: string): Promise<SleepLogDto[]> {
    const rows = await this.db.find<ITB_SLEEP_LOG>(
      TB_SLEEP_LOG,
      { created_by: username, record_status: "A" },
      {
        orderBy: "date",
        orderDirection: "desc",
        extraWhere: (qb: any) => {
          if (from) qb.where("date", ">=", from);
          if (to)   qb.where("date", "<=", to);
        },
      }
    );
    return rows.map((r) => this.mapRow(r));
  }

  async createLog(username: string, body: CreateSleepLogBody): Promise<SleepLogDto> {
    const inserted = await this.db.insert<ITB_SLEEP_LOG>(TB_SLEEP_LOG, {
      ...this.toRowData(body),
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return this.mapRow(inserted);
  }

  async updateLog(username: string, id: number, body: Partial<CreateSleepLogBody>): Promise<SleepLogDto | null> {
    const existing = await this.db.findOne<ITB_SLEEP_LOG>(TB_SLEEP_LOG, {
      id,
      created_by:    username,
      record_status: "A",
    });
    if (!existing) return null;

    const updated = await this.db.update<ITB_SLEEP_LOG>(TB_SLEEP_LOG, { id }, this.toRowData({ ...existing as any, ...body }));
    return this.mapRow(updated[0]);
  }

  async deleteLog(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_SLEEP_LOG>(TB_SLEEP_LOG, {
      id,
      created_by:    username,
      record_status: "A",
    });
    if (!existing) return false;
    await this.db.update<ITB_SLEEP_LOG>(TB_SLEEP_LOG, { id }, { record_status: "D" });
    return true;
  }

  // ─── Screenshot parsing ───────────────────────────────────────────────────────

  async parseScreenshot(image: string, mimeType: string, date?: string): Promise<Record<string, unknown>> {
    const flags = await new FeatureService(this.db).getAllFlags();
    if (!flags["sleep-screenshot-parsing"]) throw new Exceptions.ForbiddenAccess();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const base64 = image.replace(/^data:[^;]+;base64,/, "");

    const prompt = `Extract sleep metrics from this Garmin Connect screenshot. Return ONLY valid JSON with these fields (null for missing):
{
  "date": "${date ?? null}",
  "source": "garmin",
  "bedtime": "HH:MM (24h format, e.g. 01:35)",
  "wakeTime": "HH:MM (24h format, e.g. 09:34)",
  "totalSleepMin": <integer minutes>,
  "deepMin": <integer minutes>,
  "lightMin": <integer minutes>,
  "remMin": <integer minutes>,
  "awakeMin": <integer minutes>,
  "restingHrBpm": <integer>,
  "bodyBatteryChange": <integer, positive number>,
  "avgSpo2Pct": <integer>,
  "lowestSpo2Pct": <integer>,
  "avgRespirationBrpm": <integer>,
  "lowestRespirationBrpm": <integer>
}`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } },
          { type: "text", text: prompt }
        ]
      }]
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
  }

  // ─── Bulk upsert ─────────────────────────────────────────────────────────────

  async bulkUpsert(username: string, entries: CreateSleepLogBody[]): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      const existing = await this.db.findOne<ITB_SLEEP_LOG>(TB_SLEEP_LOG, {
        date:          entry.date,
        created_by:    username,
        record_status: "A",
      });
      if (existing) {
        await this.db.update<ITB_SLEEP_LOG>(TB_SLEEP_LOG, { id: existing.id }, this.toRowData(entry));
      } else {
        await this.db.insert<ITB_SLEEP_LOG>(TB_SLEEP_LOG, {
          ...this.toRowData(entry),
          created_by:    username,
          created_dt:    Date.now(),
          record_status: "A",
        });
      }
      count++;
    }
    return count;
  }
}
