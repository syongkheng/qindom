import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_AGENDA_FILE } from "../models/databases/tb_agenda_file";
import { ITB_AGENDA_ITEM } from "../models/databases/tb_agenda_item";
import { ITB_ITINERARY } from "../models/databases/tb_itinerary";
import { Exceptions } from "../exceptions/AppExceptions";

const TB_TRAVEL_AGENDA_FILE = "tb_travel_agenda_file";
const TB_TRAVEL_AGENDA_ITEM = "tb_travel_agenda_item";
const TB_TRAVEL_ITINERARY = "tb_travel_itinerary";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export class FileService {
  constructor(private db: KnexSqlUtilities) {}

  async upload(
    username: string,
    uuid: string,
    agendaId: number,
    blob: string,
    mimeType: string,
    name?: string | null,
    sizeInBytes?: number | null,
  ): Promise<{ id: number; uuid: string }> {
    const blobSizeBytes = Buffer.byteLength(blob, "base64");
    if (blobSizeBytes > MAX_SIZE_BYTES) throw new Exceptions.InvalidRequest("blob");

    const agendaItem = await this.db.findOne<ITB_AGENDA_ITEM>(TB_TRAVEL_AGENDA_ITEM, { id: agendaId });
    if (!agendaItem) throw new Exceptions.ForbiddenAccess();

    const itinerary = await this.db.findOne<ITB_ITINERARY>(TB_TRAVEL_ITINERARY, {
      id: agendaItem.itinerary_id,
      created_by: username,
      record_status: "A",
    });
    if (!itinerary) throw new Exceptions.ForbiddenAccess();

    const file = (await this.db.insert<ITB_AGENDA_FILE>(TB_TRAVEL_AGENDA_FILE, {
      uuid,
      agenda_item_id: agendaId,
      name: name ?? undefined,
      mime_type: mimeType,
      size_in_bytes: sizeInBytes ?? undefined,
      blob,
      created_dt: Date.now(),
      record_status: "A",
    })) as ITB_AGENDA_FILE;

    return { id: file.id!, uuid: file.uuid };
  }

  async getBlob(uuid: string): Promise<{ blob: string; mimeType: string } | null> {
    const file = await this.db.findOne<ITB_AGENDA_FILE>(TB_TRAVEL_AGENDA_FILE, { uuid, record_status: "A" }, [
      "blob",
      "mime_type",
    ]);

    if (!file?.blob) return null;

    const buffer = Buffer.isBuffer(file.blob) ? file.blob : Buffer.from(file.blob); // <-- important

    const base64 = buffer.toString("base64");

    return {
      blob: base64,
      mimeType: file.mime_type ?? "application/octet-stream",
    };
  }

  async deleteByUuids(username: string, fileIds: string[]): Promise<number> {
    await this.db.raw(
      `UPDATE ${TB_TRAVEL_AGENDA_FILE} af
         JOIN ${TB_TRAVEL_AGENDA_ITEM} ai ON af.agenda_item_id = ai.id
         JOIN ${TB_TRAVEL_ITINERARY}   it ON ai.itinerary_id   = it.id
       SET af.record_status = 'D'
       WHERE af.uuid IN (?)
         AND it.created_by = ?
         AND af.record_status = 'A'`,
      [fileIds, username],
    );
    return fileIds.length;
  }
}
