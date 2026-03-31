import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_MEAL_LOG } from "../models/databases/tb_meal_log";
import { ITB_MEAL_PHOTO } from "../models/databases/tb_meal_photo";
import { Exceptions } from "../exceptions/AppExceptions";

const TB_MEAL_LOG   = "tb_meal_log";
const TB_MEAL_PHOTO = "tb_meal_photo";

const MAX_BLOB_BYTES = 5 * 1024 * 1024;

export interface MealLogDto {
  id: number;
  logDate: string;
  mealType: string;
  plannedName: string;
  notes: string | null;
  photo: { uuid: string; mimeType: string; blob: string } | null;
  createdAt: number;
}

export interface MealRangeEntryDto {
  id: number;
  mealType: string;
  plannedName: string;
  notes: string | null;
  hasPhoto: boolean;
}

export interface CreateMealBody {
  logDate: string;
  mealType: string;
  plannedName: string;
  notes?: string | null;
}

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string; sizeInBytes: number } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return { buffer, mimeType: match[1], sizeInBytes: buffer.length };
}

export class MealService {
  constructor(private db: KnexSqlUtilities) {}

  async getByDate(username: string, date: string): Promise<MealLogDto[]> {
    const logs = await this.db.find<ITB_MEAL_LOG>(
      TB_MEAL_LOG,
      { created_by: username, log_date: date, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "asc" }
    );

    if (logs.length === 0) return [];

    const logIds = logs.map((l) => l.id!);
    const placeholders = logIds.map(() => "?").join(",");
    const photos: ITB_MEAL_PHOTO[] = await this.db.raw<ITB_MEAL_PHOTO[]>(
      `SELECT * FROM ${TB_MEAL_PHOTO} WHERE meal_log_id IN (${placeholders}) AND record_status = 'A'`,
      logIds
    );

    const photoMap: Record<number, { uuid: string; mimeType: string; blob: string }> = {};
    for (const p of photos) {
      const blobStr = p.blob instanceof Buffer ? p.blob.toString("base64") : null;
      const dataUrl = blobStr && p.mime_type ? `data:${p.mime_type};base64,${blobStr}` : null;
      if (dataUrl) photoMap[p.meal_log_id] = { uuid: p.uuid, mimeType: p.mime_type!, blob: dataUrl };
    }

    return logs.map((l) => ({
      id:          l.id!,
      logDate:     l.log_date,
      mealType:    l.meal_type,
      plannedName: l.planned_name,
      notes:       l.notes ?? null,
      photo:       photoMap[l.id!] ?? null,
      createdAt:   l.created_dt,
    }));
  }

  async getRange(username: string, from: string, to: string): Promise<{ date: string; meals: MealRangeEntryDto[] }[]> {
    const logs = await this.db.find<ITB_MEAL_LOG>(
      TB_MEAL_LOG,
      { created_by: username, record_status: "A" },
      {
        columns: ["id", "log_date", "meal_type", "planned_name", "notes"],
        orderBy: "log_date",
        orderDirection: "asc",
        extraWhere: (qb) => qb.where("log_date", ">=", from).where("log_date", "<=", to),
      }
    );

    if (logs.length === 0) return [];

    const logIds = logs.map((l) => l.id!);
    const placeholders = logIds.map(() => "?").join(",");
    const photoRows: { meal_log_id: number }[] = await this.db.raw(
      `SELECT meal_log_id FROM ${TB_MEAL_PHOTO} WHERE meal_log_id IN (${placeholders}) AND record_status = 'A'`,
      logIds
    );
    const photoSet = new Set(photoRows.map((p) => p.meal_log_id));

    const grouped: Record<string, MealRangeEntryDto[]> = {};
    for (const l of logs) {
      if (!grouped[l.log_date]) grouped[l.log_date] = [];
      grouped[l.log_date].push({
        id:          l.id!,
        mealType:    l.meal_type,
        plannedName: l.planned_name,
        notes:       l.notes ?? null,
        hasPhoto:    photoSet.has(l.id!),
      });
    }

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, meals]) => ({ date, meals }));
  }

  async create(username: string, body: CreateMealBody): Promise<{ id: number }> {
    const inserted = await this.db.insert<ITB_MEAL_LOG>(TB_MEAL_LOG, {
      log_date:      body.logDate,
      meal_type:     body.mealType,
      planned_name:  body.plannedName,
      notes:         body.notes ?? null,
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return { id: inserted.id! };
  }

  async update(username: string, id: number, plannedName: string, notes?: string | null): Promise<boolean> {
    const existing = await this.db.findOne<ITB_MEAL_LOG>(
      TB_MEAL_LOG,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_MEAL_LOG>(TB_MEAL_LOG, { id }, { planned_name: plannedName, notes: notes ?? null });
    return true;
  }

  async delete(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_MEAL_LOG>(
      TB_MEAL_LOG,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_MEAL_LOG>(TB_MEAL_LOG, { id }, { record_status: "D" });
    await this.db.update<ITB_MEAL_PHOTO>(TB_MEAL_PHOTO, { meal_log_id: id, record_status: "A" }, { record_status: "D" });
    return true;
  }

  async uploadPhoto(
    username: string,
    mealLogId: number,
    blob: string,
    mimeType: string,
    name?: string | null,
  ): Promise<{ uuid: string }> {
    const log = await this.db.findOne<ITB_MEAL_LOG>(
      TB_MEAL_LOG,
      { id: mealLogId, created_by: username, record_status: "A" }
    );
    if (!log) throw new Exceptions.NotFound();

    const parsed = base64ToBuffer(blob);
    if (!parsed) throw new Exceptions.InvalidRequest("blob");
    if (parsed.sizeInBytes > MAX_BLOB_BYTES) throw new Exceptions.InvalidRequest("blob");

    await this.db.update<ITB_MEAL_PHOTO>(TB_MEAL_PHOTO, { meal_log_id: mealLogId, record_status: "A" }, { record_status: "D" });

    const uuid = crypto.randomUUID();
    await this.db.insert<ITB_MEAL_PHOTO>(TB_MEAL_PHOTO, {
      uuid,
      meal_log_id:   mealLogId,
      name:          name ?? null,
      mime_type:     parsed.mimeType,
      size_in_bytes: parsed.sizeInBytes,
      blob:          parsed.buffer,
      created_dt:    Date.now(),
      record_status: "A",
    });

    return { uuid };
  }

  async deletePhoto(username: string, mealLogId: number): Promise<boolean> {
    const log = await this.db.findOne<ITB_MEAL_LOG>(
      TB_MEAL_LOG,
      { id: mealLogId, created_by: username, record_status: "A" }
    );
    if (!log) return false;
    await this.db.update<ITB_MEAL_PHOTO>(TB_MEAL_PHOTO, { meal_log_id: mealLogId, record_status: "A" }, { record_status: "D" });
    return true;
  }
}
