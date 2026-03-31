import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";
import { CreateSleepLogBody } from "./Sleep.service";

const VALID_SOURCES = ["garmin", "phone", "manual"];

export class SleepValidator {
  static mapImportEntry(raw: Record<string, any>): CreateSleepLogBody {
    return {
      date:                    raw.date,
      source:                  raw.source ?? "manual",
      bedtime:                 raw.bedtime ?? null,
      wakeTime:                raw.wake_time ?? null,
      totalSleepMin:           raw.total_sleep_min ?? null,
      deepMin:                 raw.deep_min ?? null,
      lightMin:                raw.light_min ?? null,
      remMin:                  raw.rem_min ?? null,
      awakeMin:                raw.awake_min ?? null,
      deepPct:                 raw.deep_pct ?? null,
      lightPct:                raw.light_pct ?? null,
      remPct:                  raw.rem_pct ?? null,
      restingHrBpm:            raw.resting_hr_bpm ?? null,
      bodyBatteryChange:       raw.body_battery_change ?? null,
      avgSpo2Pct:              raw.avg_spo2_pct ?? null,
      lowestSpo2Pct:           raw.lowest_spo2_pct ?? null,
      avgRespirationBrpm:      raw.avg_respiration_brpm ?? null,
      lowestRespirationBrpm:   raw.lowest_respiration_brpm ?? null,
      notes:                   raw.notes ?? null,
    };
  }

  static validateCreateRequest(req: Request): CreateSleepLogBody {
    const { date, source } = req.body;
    if (!date) throw new InvalidRequestException("date");
    if (!source || !VALID_SOURCES.includes(source)) throw new InvalidRequestException("source");
    return this.mapImportEntry(req.body);
  }

  static validateUpdateRequest(req: Request): { id: number; body: Partial<CreateSleepLogBody> } {
    const { id, ...rest } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id), body: this.mapImportEntry(rest) };
  }

  static validateBulkRequest(req: Request): CreateSleepLogBody[] {
    const raw: Record<string, any>[] = req.body.entries ?? req.body.sleep_dataset ?? [];
    if (!Array.isArray(raw) || raw.length === 0) throw new InvalidRequestException("entries");
    return raw.map((e) => this.mapImportEntry(e));
  }

  static validateIdRequest(req: Request): { id: number } {
    const { id } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id) };
  }

  static validateParseScreenshotRequest(req: Request): { image: string; mimeType: string; date?: string } {
    const { image, mimeType, date } = req.body;
    if (!image || typeof image !== "string") throw new InvalidRequestException("image");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!mimeType || !allowed.includes(mimeType)) throw new InvalidRequestException("mimeType");
    return { image, mimeType, date: date || undefined };
  }
}
