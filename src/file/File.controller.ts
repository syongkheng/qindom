import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_AGENDA_FILE } from "../models/databases/tb_agenda_file";

const TABLE_AGENDA_FILE = "tb_travel_agenda_file";

export default function createFileController(db: KnexSqlUtilities) {
  const router = Router();

  // POST / — upload a file blob and associate it with an agenda item
  router.post("/", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { uuid, agendaId, name, mimeType, sizeInBytes, blob } = req.body;

      if (!uuid || !agendaId) return response.badRequest("uuid and agendaId are required");
      if (!blob) return response.badRequest("blob is required");

      const now = Date.now();

      const file = await db.insert<ITB_AGENDA_FILE>(TABLE_AGENDA_FILE, {
        uuid,
        agenda_item_id: Number(agendaId),
        name: name || null,
        mime_type: mimeType || null,
        size_in_bytes: sizeInBytes || null,
        blob,
        created_dt: now,
        record_status: "A",
      });

      return response.ok({ id: file.id, uuid: file.uuid });
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  // POST /delete — soft-delete files by their UUIDs
  router.post("/delete", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { _fileIdsToDelete } = req.body;

      if (!Array.isArray(_fileIdsToDelete) || _fileIdsToDelete.length === 0) {
        return response.badRequest("_fileIdsToDelete must be a non-empty array");
      }

      for (const uuid of _fileIdsToDelete) {
        await db.update<ITB_AGENDA_FILE>(TABLE_AGENDA_FILE, { uuid }, { record_status: "D" });
      }

      return response.ok({ deleted: _fileIdsToDelete.length });
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  return router;
}
