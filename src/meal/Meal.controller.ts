import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import crypto from "crypto";
import { ITB_MEAL_LOG } from "../models/databases/tb_meal_log";
import { ITB_MEAL_PHOTO } from "../models/databases/tb_meal_photo";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { toMessage } from "../utils/errorUtils";
import { LoggingUtilities } from "../utils/LoggingUtilities";

const TABLE_MEAL_LOG = "tb_meal_log";
const TABLE_MEAL_PHOTO = "tb_meal_photo";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"];
const MAX_BLOB_BYTES = 5 * 1024 * 1024;

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string; sizeInBytes: number } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return { buffer, mimeType: match[1], sizeInBytes: buffer.length };
}

export default function createMealController(db: KnexSqlUtilities): Router {
  const router = Router();

  // GET /api/meal/range?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get("/range", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const from = req.query.from as string;
      const to = req.query.to as string;

      if (!from || !to) return cr.badRequest("from and to are required");

      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to)
        return cr.badRequest("Invalid date range");

      const logs = await db.find<ITB_MEAL_LOG>(
        TABLE_MEAL_LOG,
        { created_by: username, record_status: "A" },
        {
          columns: ["id", "log_date", "meal_type", "planned_name", "notes"],
          orderBy: "log_date",
          orderDirection: "asc",
          extraWhere: (qb) => qb.where("log_date", ">=", from).where("log_date", "<=", to),
        }
      );

      if (logs.length === 0) return cr.ok([]);

      const logIds = logs.map((l) => l.id!);
      const placeholders = logIds.map(() => "?").join(",");
      const photoRows: { meal_log_id: number }[] = await db.raw(
        `SELECT meal_log_id FROM ${TABLE_MEAL_PHOTO} WHERE meal_log_id IN (${placeholders}) AND record_status = 'A'`,
        logIds
      );
      const photoSet = new Set(photoRows.map((p) => p.meal_log_id));

      const grouped: Record<string, any[]> = {};
      for (const l of logs) {
        if (!grouped[l.log_date]) grouped[l.log_date] = [];
        grouped[l.log_date].push({
          id: l.id,
          mealType: l.meal_type,
          plannedName: l.planned_name,
          notes: l.notes ?? null,
          hasPhoto: photoSet.has(l.id!),
        });
      }

      const result = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, meals]) => ({ date, meals }));

      return cr.ok(result);
    } catch (err) {
      LoggingUtilities.service.error("MealController.GET /range", toMessage(err));
      return cr.ko("Failed to fetch meal range");
    }
  });

  // GET /api/meal?date=YYYY-MM-DD
  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

      const logs = await db.find<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { created_by: username, log_date: date, record_status: "A" }, { orderBy: "created_dt", orderDirection: "asc" });

      if (logs.length === 0) {
        return cr.ok([]);
      }

      const logIds = logs.map((l) => l.id!);
      const placeholders = logIds.map(() => "?").join(",");
      const photos: ITB_MEAL_PHOTO[] = await db.raw<ITB_MEAL_PHOTO[]>(
        `SELECT * FROM ${TABLE_MEAL_PHOTO} WHERE meal_log_id IN (${placeholders}) AND record_status = 'A'`,
        logIds
      );

      const photoMap: Record<number, { uuid: string; mimeType: string; blob: string }> = {};
      for (const p of photos) {
        const blobStr = p.blob instanceof Buffer ? p.blob.toString("base64") : null;
        const dataUrl = blobStr && p.mime_type ? `data:${p.mime_type};base64,${blobStr}` : null;
        if (dataUrl) {
          photoMap[p.meal_log_id] = { uuid: p.uuid, mimeType: p.mime_type!, blob: dataUrl };
        }
      }

      const result = logs.map((l) => ({
        id: l.id,
        logDate: l.log_date,
        mealType: l.meal_type,
        plannedName: l.planned_name,
        notes: l.notes ?? null,
        photo: photoMap[l.id!] ?? null,
        createdAt: l.created_dt,
      }));

      return cr.ok(result);
    } catch (err) {
      LoggingUtilities.service.error("MealController.GET /", toMessage(err));
      return cr.ko("Failed to fetch meals");
    }
  });

  // POST /api/meal — create meal plan entry
  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { logDate, mealType, plannedName, notes } = req.body;

      if (!logDate || !mealType || !plannedName) {
        return cr.badRequest("logDate, mealType, and plannedName are required");
      }

      const validTypes = ["breakfast", "lunch", "dinner", "snack"];
      if (!validTypes.includes(mealType)) {
        return cr.badRequest("Invalid mealType");
      }

      const inserted = await db.insert<ITB_MEAL_LOG>(TABLE_MEAL_LOG, {
        log_date: logDate,
        meal_type: mealType,
        planned_name: plannedName,
        notes: notes ?? null,
        created_by: username,
        created_dt: Date.now(),
        record_status: "A",
      });

      return cr.ok({ id: inserted.id });
    } catch (err) {
      LoggingUtilities.service.error("MealController.POST /", toMessage(err));
      return cr.ko("Failed to create meal");
    }
  });

  // POST /api/meal/update
  router.post("/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { id, plannedName, notes } = req.body;

      if (!id || !plannedName) {
        return cr.badRequest("id and plannedName are required");
      }

      const existing = await db.findOne<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { id, created_by: username, record_status: "A" });
      if (!existing) {
        return cr.result(404, "Not Found", "Meal not found");
      }

      await db.update<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { id }, { planned_name: plannedName, notes: notes ?? null });

      return cr.ok(null);
    } catch (err) {
      LoggingUtilities.service.error("MealController.POST /update", toMessage(err));
      return cr.ko("Failed to update meal");
    }
  });

  // POST /api/meal/delete
  router.post("/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { id } = req.body;

      if (!id) {
        return cr.badRequest("id is required");
      }

      const existing = await db.findOne<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { id, created_by: username, record_status: "A" });
      if (!existing) {
        return cr.result(404, "Not Found", "Meal not found");
      }

      await db.update<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { id }, { record_status: "D" });
      await db.update<ITB_MEAL_PHOTO>(TABLE_MEAL_PHOTO, { meal_log_id: id, record_status: "A" }, { record_status: "D" });

      return cr.ok(null);
    } catch (err) {
      LoggingUtilities.service.error("MealController.POST /delete", toMessage(err));
      return cr.ko("Failed to delete meal");
    }
  });

  // POST /api/meal/photo — upload/replace actual meal photo
  router.post("/photo", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { mealLogId, name, mimeType, sizeInBytes, blob } = req.body;

      if (!mealLogId || !blob) {
        return cr.badRequest("mealLogId and blob are required");
      }

      if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
        return cr.badRequest("Invalid image type");
      }

      const parsed = base64ToBuffer(blob);
      if (!parsed) {
        return cr.badRequest("Invalid blob format — expected data URL");
      }
      if (parsed.sizeInBytes > MAX_BLOB_BYTES) {
        return cr.badRequest("Image exceeds 5 MB limit");
      }

      const log = await db.findOne<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { id: mealLogId, created_by: username, record_status: "A" });
      if (!log) {
        return cr.result(404, "Not Found", "Meal not found");
      }

      await db.update<ITB_MEAL_PHOTO>(TABLE_MEAL_PHOTO, { meal_log_id: mealLogId, record_status: "A" }, { record_status: "D" });

      const uuid = crypto.randomUUID();
      await db.insert<ITB_MEAL_PHOTO>(TABLE_MEAL_PHOTO, {
        uuid,
        meal_log_id: mealLogId,
        name: name ?? null,
        mime_type: parsed.mimeType,
        size_in_bytes: parsed.sizeInBytes,
        blob: parsed.buffer,
        created_dt: Date.now(),
        record_status: "A",
      });

      return cr.ok({ uuid });
    } catch (err) {
      LoggingUtilities.service.error("MealController.POST /photo", toMessage(err));
      return cr.ko("Failed to upload photo");
    }
  });

  // POST /api/meal/photo/delete
  router.post("/photo/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { mealLogId } = req.body;

      if (!mealLogId) {
        return cr.badRequest("mealLogId is required");
      }

      const log = await db.findOne<ITB_MEAL_LOG>(TABLE_MEAL_LOG, { id: mealLogId, created_by: username, record_status: "A" });
      if (!log) {
        return cr.result(404, "Not Found", "Meal not found");
      }

      await db.update<ITB_MEAL_PHOTO>(TABLE_MEAL_PHOTO, { meal_log_id: mealLogId, record_status: "A" }, { record_status: "D" });

      return cr.ok(null);
    } catch (err) {
      LoggingUtilities.service.error("MealController.POST /photo/delete", toMessage(err));
      return cr.ko("Failed to delete photo");
    }
  });

  return router;
}
