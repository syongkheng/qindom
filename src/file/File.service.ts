import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { FileDeletedDto } from "./File.types.js";

const TRAVEL_AGENDA_FILE_TABLE = "tb_travel_agenda_file";
const TRAVEL_AGENDA_ITEM_TABLE = "tb_travel_agenda_item";
const TRAVEL_ITINERARY_TABLE = "tb_travel_itinerary";

/** mysql2's result for an UPDATE run through `KnexSqlUtilities.raw`. */
interface UpdateResult {
  affectedRows: number;
}

/**
 * Agenda-item file records. Files are created by the itinerary save (`Itinerary.service.ts`);
 * this module only soft-deletes them.
 */
export class FileService {
  constructor(private db: KnexSqlUtilities) {}

  /** Soft-deletes the caller's own files (ownership = the itinerary's creator). */
  async deleteByUuids(userId: number, fileUuids: string[], logContext?: IRequestLogContext): Promise<FileDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", `Delete ${fileUuids.length} file(s)`);
    const result = await this.db.raw<UpdateResult>(
      `UPDATE ${TRAVEL_AGENDA_FILE_TABLE} af
         JOIN ${TRAVEL_AGENDA_ITEM_TABLE} ai ON af.agenda_item_id = ai.id
         JOIN ${TRAVEL_ITINERARY_TABLE}   it ON ai.itinerary_id   = it.id
       SET af.record_status = ?
       WHERE af.uuid IN (?)
         AND it.created_by_id = ?
         AND af.record_status = ?`,
      [RecordStatus.DELETED, fileUuids, userId, RecordStatus.ACTIVE],
    );
    const deleted = result.affectedRows;
    if (event) event.detail = `${deleted} deleted`;
    return { deleted };
  }
}
