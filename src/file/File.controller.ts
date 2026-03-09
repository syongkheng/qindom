import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_AGENDA_FILE } from "../models/databases/tb_agenda_file";
import { toMessage } from "../utils/errorUtils";

const TABLE_AGENDA_FILE = "tb_travel_agenda_file";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export default function createFileController(db: KnexSqlUtilities) {
  const router = Router();

  // POST / — upload a file blob and associate it with an agenda item
  router.post("/", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { uuid, agendaId, name, mimeType, sizeInBytes, blob } = req.body;

      if (!uuid || !agendaId) return response.badRequest("uuid and agendaId are required");
      if (!blob) return response.badRequest("blob is required");

      if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
        return response.badRequest("Only image files are allowed (jpeg, png, gif, webp, svg)");
      }

      const blobSizeBytes = Buffer.byteLength(blob, "base64");
      if (blobSizeBytes > MAX_SIZE_BYTES) {
        return response.badRequest("File size must not exceed 5MB");
      }

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
    } catch (error) {
      return response.ko(toMessage(error));
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
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  return router;
}
