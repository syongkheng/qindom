import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_AGENDA_FILE } from "../models/databases/tb_agenda_file.js";
import { ITB_AGENDA_ITEM } from "../models/databases/tb_agenda_item.js";
import { ITB_ITINERARY } from "../models/databases/tb_itinerary.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const TB_TRAVEL_AGENDA_FILE = "tb_travel_agenda_file";
const TB_TRAVEL_AGENDA_ITEM = "tb_travel_agenda_item";
const TB_TRAVEL_ITINERARY   = "tb_travel_itinerary";

export class FileService {
  constructor(private db: KnexSqlUtilities) {}

  async uploadTg(
    userId: number,
    uuid: string,
    agendaId: number,
    tgShortCode: string,
    mimeType: string,
    name?: string | null,
    sizeInBytes?: number | null,
  ): Promise<{ id: number; uuid: string }> {
    const agendaItem = await this.db.findOne<ITB_AGENDA_ITEM>(TB_TRAVEL_AGENDA_ITEM, { id: agendaId });
    if (!agendaItem) throw new Exceptions.ForbiddenAccess();

    const itinerary = await this.db.findOne<ITB_ITINERARY>(TB_TRAVEL_ITINERARY, {
      id: agendaItem.itinerary_id,
      created_by_id: userId,
      record_status: "A",
    });
    if (!itinerary) throw new Exceptions.ForbiddenAccess();

    const existing = await this.db.findOne<ITB_AGENDA_FILE>(TB_TRAVEL_AGENDA_FILE, {
      uuid,
      record_status: "A",
    });
    if (existing) return { id: existing.id!, uuid: existing.uuid };

    const file = (await this.db.insert<ITB_AGENDA_FILE>(TB_TRAVEL_AGENDA_FILE, {
      uuid,
      tg_short_code: tgShortCode,
      agenda_item_id: agendaId,
      name: name ?? undefined,
      mime_type: mimeType,
      size_in_bytes: sizeInBytes ?? undefined,
      created_dt: Date.now(),
      record_status: "A",
    })) as ITB_AGENDA_FILE;

    return { id: file.id!, uuid: file.uuid };
  }

  async deleteByUuids(userId: number, fileIds: string[]): Promise<number> {
    await this.db.raw(
      `UPDATE ${TB_TRAVEL_AGENDA_FILE} af
         JOIN ${TB_TRAVEL_AGENDA_ITEM} ai ON af.agenda_item_id = ai.id
         JOIN ${TB_TRAVEL_ITINERARY}   it ON ai.itinerary_id   = it.id
       SET af.record_status = 'D'
       WHERE af.uuid IN (?)
         AND it.created_by_id = ?
         AND af.record_status = 'A'`,
      [fileIds, userId],
    );
    return fileIds.length;
  }
}
