import crypto from "crypto";
import { Knex } from "knex";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_ITINERARY } from "../models/databases/tb_itinerary.js";
import { ITB_AGENDA_ITEM } from "../models/databases/tb_agenda_item.js";
import { ITB_AGENDA_FILE } from "../models/databases/tb_agenda_file.js";
import { ITB_TRAVEL_ITINERARY_BOOKING } from "../models/databases/tb_travel_itinerary_booking.js";
import { ITB_TRAVEL_PACKING_ITEM } from "../models/databases/tb_travel_packing_item.js";
import { ITB_TRAVEL_NOTE_ITEM } from "../models/databases/tb_travel_note_item.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import {
  AGENDA_FILE_TABLE,
  AGENDA_ITEM_TABLE,
  BOOKING_TABLE,
  DEFAULT_PACKING_CATEGORY,
  ITINERARY_TABLE,
  NOTE_ITEM_TABLE,
  PACKING_ITEM_TABLE,
  findOwnedItinerary,
  timeToMinutes,
} from "./Itinerary.service.js";
import {
  AgendaFileMapEntryDto,
  AgendaItemBody,
  BookingBody,
  ItineraryCreateBody,
  ItineraryFieldsBody,
  ItinerarySavedDto,
  ItineraryUpdateBody,
  NoteItemBody,
  PackingItemBody,
} from "./Itinerary.types.js";

const DEFAULT_NUMBER_OF_PAX = 1;
const DEFAULT_DURATION_IN_DAYS = 1;
const DEFAULT_BOOKING_SORT_ORDER = 0;
/** 4 random bytes = 8 hex chars (`short_code` VARCHAR(16), unique). */
const SHORT_CODE_BYTES = 4;

/** Id sources, injectable so tests get stable values. */
export interface ItineraryIdGenerator {
  sessionId: () => string;
  shortCode: () => string;
}

const randomIds: ItineraryIdGenerator = {
  sessionId: () => crypto.randomUUID(),
  shortCode: () => crypto.randomBytes(SHORT_CODE_BYTES).toString("hex"),
};

// ── Body → columns ────────────────────────────────────────────────────────────
// `undefined` = "leave the column alone" (knex drops undefined keys), so on update a blank
// optional field keeps its stored value and on insert it gets the column default. This is the
// long-standing behaviour fndom relies on; see README "Known gaps".

const jsonList = (values: string[] | null | undefined) => (values?.length ? JSON.stringify(values) : undefined);

/** Columns shared by create and update. */
function itineraryColumns(body: ItineraryFieldsBody): Partial<ITB_ITINERARY> {
  return {
    destination: body.destination ?? undefined,
    destination_raw: jsonList(body.destinationRaw),
    country: body.country ?? undefined,
    number_of_pax: body.numberOfPax || DEFAULT_NUMBER_OF_PAX,
    itinerary_date_raw: jsonList(body.itineraryDateRaw),
    start_date: body.startDate || undefined,
    end_date: body.endDate || undefined,
    unknown_date: body.unknownDate ? 1 : 0,
    duration_in_days: body.durationInDays || DEFAULT_DURATION_IN_DAYS,
  };
}

export function agendaColumns(item: AgendaItemBody): Partial<ITB_AGENDA_ITEM> {
  return {
    category: item.category ?? undefined,
    list_type: item.listType ?? undefined,
    title: item.title,
    desc: item.desc ?? undefined,
    city: item.city ?? undefined,
    city_raw: jsonList(item.cityRaw),
    coordinates_lat: item.coordinates?.lat,
    coordinates_lng: item.coordinates?.lng,
    start_time: timeToMinutes(item.startTime),
    end_time: timeToMinutes(item.endTime),
    duration_in_hours: item.durationInHours || undefined,
    unknown_time: item.unknownTime ? 1 : 0,
    budget: item.budget || undefined,
    day: item.day || undefined,
    date: item.date ?? undefined,
  };
}

export function bookingColumns(b: BookingBody): Partial<ITB_TRAVEL_ITINERARY_BOOKING> {
  return {
    category: b.category ?? undefined,
    item: b.item,
    location: b.remarks ?? undefined,
    link: b.link ?? undefined,
    payment: b.payment ?? undefined,
    start_date: b.startDate ?? undefined,
    end_date: b.endDate ?? undefined,
    nights: b.nights ?? undefined,
    price: b.price ?? undefined,
    booked: b.booked ? 1 : 0,
    free_cancellation: b.freeCancellation ?? undefined,
    breakfast: b.breakfast ? 1 : 0,
    deposit: b.deposit ?? undefined,
    pax_breakdown: b.paxBreakdown ? JSON.stringify(b.paxBreakdown) : undefined,
    sort_order: b.sortOrder ?? DEFAULT_BOOKING_SORT_ORDER,
  };
}

/** `sortOrder` = position in the request list. */
export function packingColumns(p: PackingItemBody, sortOrder: number): Partial<ITB_TRAVEL_PACKING_ITEM> {
  return {
    label: p.label,
    category: p.category ?? DEFAULT_PACKING_CATEGORY,
    packed: p.packed ? 1 : 0,
    quantity: p.quantity,
    sort_order: sortOrder,
  };
}

export function noteColumns(n: NoteItemBody, sortOrder: number): Partial<ITB_TRAVEL_NOTE_ITEM> {
  return {
    label: n.label,
    category: n.category ?? undefined,
    url: n.url ?? undefined,
    done: n.done ? 1 : 0,
    sort_order: sortOrder,
  };
}

/**
 * Creates and updates trips from fndom's planner payload (the whole trip in one request).
 *
 * Child rows on update are addressed by client-supplied ids. Any child id (agenda, booking,
 * packing, note; updated or listed for deletion) that isn't this trip's is a 403 before anything
 * is written, and every child update/delete is still scoped by `itinerary_id` inside the trx.
 *
 * Writes run in one transaction on the raw knex trx (batch inserts, `whereIn`, `pluck`), so the
 * individual statements are not timed; the transaction as a whole is (`db.transaction(cb, event)`).
 */
export class ItinerarySaveService {
  constructor(
    private db: KnexSqlUtilities,
    private ids: ItineraryIdGenerator = randomIds,
  ) {}

  async create(userId: number, body: ItineraryCreateBody, logContext?: IRequestLogContext): Promise<ItinerarySavedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create itinerary");

    if (body.idempotencyKey) {
      const replay = await this.findReplay(userId, body.idempotencyKey, event);
      if (replay) return replay;
    }

    const sessionId = this.ids.sessionId();
    const shortCode = this.ids.shortCode();
    const now = Date.now();

    const agendaToFileMap = await this.db.transaction(async (trx) => {
      const [itineraryId] = await trx(ITINERARY_TABLE).insert({
        ...itineraryColumns(body),
        session_id: sessionId,
        short_code: shortCode,
        idempotency_key: body.idempotencyKey ?? undefined,
        session_title: body.sessionTitle,
        challenge: body.challenge ?? undefined,
        pax_names: jsonList(body.paxNames),
        created_dt: now,
        created_by_id: userId,
        record_status: RecordStatus.ACTIVE,
      });
      const map = await this.saveAgenda(trx, itineraryId, body.agendaItems, now);
      await this.saveBookings(trx, itineraryId, body.bookings, now);
      await this.savePacking(trx, itineraryId, body.packingItems, now);
      await this.saveNotes(trx, itineraryId, body.noteItems, now);
      return map;
    }, event);

    if (event) event.detail = `${body.agendaItems.length} agenda item(s)`;
    return { shortCode, sessionId, agendaToFileMap };
  }

  async update(
    userId: number,
    sessionId: string,
    body: ItineraryUpdateBody,
    logContext?: IRequestLogContext,
  ): Promise<ItinerarySavedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update itinerary");
    const itinerary = await findOwnedItinerary(this.db, userId, sessionId, event);
    const itineraryId = Number(itinerary.id);

    // Checked before the transaction, so a foreign id is a 403 before anything is written.
    await this.assertChildrenOwned(itineraryId, body, event);

    const now = Date.now();
    const agendaToFileMap = await this.db.transaction(async (trx) => {
      await trx(ITINERARY_TABLE)
        .where({ id: itineraryId })
        .update({
          ...itineraryColumns(body),
          session_title: body.sessionTitle || itinerary.session_title,
          challenge: body.challenge === undefined ? itinerary.challenge : body.challenge || null,
          pax_names: body.paxNames === undefined ? undefined : (jsonList(body.paxNames) ?? null),
        });

      await this.softDelete(trx, AGENDA_ITEM_TABLE, itineraryId, body.agendaIdsToDelete);
      const map = await this.saveAgenda(trx, itineraryId, body.agendaItems, now);
      await this.softDelete(trx, BOOKING_TABLE, itineraryId, body.bookingIdsToDelete);
      await this.saveBookings(trx, itineraryId, body.bookings, now);
      await this.softDelete(trx, PACKING_ITEM_TABLE, itineraryId, body.packingIdsToDelete);
      await this.savePacking(trx, itineraryId, body.packingItems, now);
      await this.softDelete(trx, NOTE_ITEM_TABLE, itineraryId, body.noteIdsToDelete);
      await this.saveNotes(trx, itineraryId, body.noteItems, now);
      return map;
    }, event);

    if (event) event.detail = `${body.agendaItems.length} agenda item(s)`;
    return { shortCode: itinerary.short_code, sessionId, agendaToFileMap };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /** Same caller + same key → the trip that key created (another user's key never resolves). */
  private async findReplay(
    userId: number,
    idempotencyKey: string,
    event?: IRequestLogEvent,
  ): Promise<ItinerarySavedDto | undefined> {
    const existing = await this.db.findOne<ITB_ITINERARY>(
      ITINERARY_TABLE,
      { idempotency_key: idempotencyKey, created_by_id: userId },
      ["id", "session_id", "short_code"],
      event,
    );
    if (!existing) return undefined;
    const agenda = await this.db.find<ITB_AGENDA_ITEM>(
      AGENDA_ITEM_TABLE,
      { itinerary_id: existing.id, record_status: RecordStatus.ACTIVE },
      { orderBy: "id", orderDirection: "asc", columns: ["id"] },
      event,
    );
    if (event) event.detail = "idempotent replay";
    return {
      shortCode: existing.short_code,
      sessionId: existing.session_id,
      agendaToFileMap: agenda.map((a) => ({ agendaId: Number(a.id), fileUuids: [] })),
    };
  }

  /**
   * 403 if any child id (updated or listed for deletion) isn't one of this trip's rows, for every
   * child table. Rows already soft-deleted still count as this trip's.
   */
  private async assertChildrenOwned(
    itineraryId: number,
    body: ItineraryUpdateBody,
    event?: IRequestLogEvent,
  ): Promise<void> {
    const idsOf = (rows: { id: number | null }[], toDelete: number[]) => [
      ...rows.map((r) => r.id).filter((id): id is number => id !== null),
      ...toDelete,
    ];
    await Promise.all([
      this.assertOwned(AGENDA_ITEM_TABLE, itineraryId, idsOf(body.agendaItems, body.agendaIdsToDelete), event),
      this.assertOwned(BOOKING_TABLE, itineraryId, idsOf(body.bookings, body.bookingIdsToDelete), event),
      this.assertOwned(PACKING_ITEM_TABLE, itineraryId, idsOf(body.packingItems, body.packingIdsToDelete), event),
      this.assertOwned(NOTE_ITEM_TABLE, itineraryId, idsOf(body.noteItems, body.noteIdsToDelete), event),
    ]);
  }

  /** One query per child table: every id must belong to `itineraryId`. */
  private async assertOwned(table: string, itineraryId: number, ids: number[], event?: IRequestLogEvent) {
    if (!ids.length) return;
    const owned = await this.db.find<{ id: number; itinerary_id: number }>(
      table,
      { itinerary_id: itineraryId },
      { columns: ["id"], extraWhere: (qb) => qb.whereIn("id", ids) },
      event,
    );
    const ownedIds = new Set(owned.map((r) => Number(r.id)));
    if (ids.some((id) => !ownedIds.has(id))) throw new Exceptions.ForbiddenAccess("Item not in this itinerary");
  }

  private async softDelete(trx: Knex.Transaction, table: string, itineraryId: number, ids: number[]): Promise<void> {
    if (!ids.length) return;
    await trx(table)
      .where({ itinerary_id: itineraryId })
      .whereIn("id", ids)
      .update({ record_status: RecordStatus.DELETED });
  }

  /** Updates (scoped by `itinerary_id`) or inserts each item, then attaches its new files. */
  private async saveAgenda(
    trx: Knex.Transaction,
    itineraryId: number,
    items: AgendaItemBody[],
    now: number,
  ): Promise<AgendaFileMapEntryDto[]> {
    const map: AgendaFileMapEntryDto[] = [];
    const fileRows: Partial<ITB_AGENDA_FILE>[] = [];
    const fileUuids = items.flatMap((i) => i.filesToInsert.map((f) => f.uuid));
    const attached = new Set<string>(
      fileUuids.length
        ? await trx(AGENDA_FILE_TABLE)
            .where({ record_status: RecordStatus.ACTIVE })
            .whereIn("uuid", fileUuids)
            .pluck("uuid")
        : [],
    );

    for (const item of items) {
      let agendaId: number;
      if (item.id !== null) {
        agendaId = item.id;
        await trx(AGENDA_ITEM_TABLE).where({ id: agendaId, itinerary_id: itineraryId }).update(agendaColumns(item));
      } else {
        [agendaId] = await trx(AGENDA_ITEM_TABLE).insert({
          ...agendaColumns(item),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }

      // A uuid that is already attached (re-sent, or listed twice) is skipped, as before.
      for (const file of item.filesToInsert) {
        if (attached.has(file.uuid)) continue;
        attached.add(file.uuid);
        fileRows.push({
          uuid: file.uuid,
          tg_short_code: file.tgShortCode,
          agenda_item_id: agendaId,
          name: file.name ?? undefined,
          mime_type: file.mimeType,
          size_in_bytes: file.sizeInBytes ?? undefined,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
      map.push({ agendaId, fileUuids: item.filesToInsert.map((f) => f.uuid) });
    }

    if (fileRows.length) await trx(AGENDA_FILE_TABLE).insert(fileRows);
    return map;
  }

  private async saveBookings(trx: Knex.Transaction, itineraryId: number, bookings: BookingBody[], now: number) {
    const inserts: Partial<ITB_TRAVEL_ITINERARY_BOOKING>[] = [];
    for (const b of bookings) {
      if (b.id !== null) {
        await trx(BOOKING_TABLE).where({ id: b.id, itinerary_id: itineraryId }).update(bookingColumns(b));
      } else {
        inserts.push({
          ...bookingColumns(b),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
    }
    if (inserts.length) await trx(BOOKING_TABLE).insert(inserts);
  }

  private async savePacking(trx: Knex.Transaction, itineraryId: number, items: PackingItemBody[], now: number) {
    const inserts: Partial<ITB_TRAVEL_PACKING_ITEM>[] = [];
    for (const [index, p] of items.entries()) {
      if (p.id !== null) {
        await trx(PACKING_ITEM_TABLE).where({ id: p.id, itinerary_id: itineraryId }).update(packingColumns(p, index));
      } else {
        inserts.push({
          ...packingColumns(p, index),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
    }
    if (inserts.length) await trx(PACKING_ITEM_TABLE).insert(inserts);
  }

  private async saveNotes(trx: Knex.Transaction, itineraryId: number, items: NoteItemBody[], now: number) {
    const inserts: Partial<ITB_TRAVEL_NOTE_ITEM>[] = [];
    for (const [index, n] of items.entries()) {
      if (n.id !== null) {
        await trx(NOTE_ITEM_TABLE).where({ id: n.id, itinerary_id: itineraryId }).update(noteColumns(n, index));
      } else {
        inserts.push({
          ...noteColumns(n, index),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
    }
    if (inserts.length) await trx(NOTE_ITEM_TABLE).insert(inserts);
  }
}
