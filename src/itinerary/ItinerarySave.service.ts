import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_TRAVEL_ITINERARY } from "../models/databases/tb_travel_itinerary.js";
import { ITB_TRAVEL_AGENDA_ITEM } from "../models/databases/tb_travel_agenda_item.js";
import { ITB_TRAVEL_AGENDA_FILE } from "../models/databases/tb_travel_agenda_file.js";
import { ITB_TRAVEL_ITINERARY_BOOKING } from "../models/databases/tb_travel_itinerary_booking.js";
import { ITB_TRAVEL_PACKING_ITEM } from "../models/databases/tb_travel_packing_item.js";
import { ITB_TRAVEL_NOTE_ITEM } from "../models/databases/tb_travel_note_item.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TgImageService } from "../tgimage/TgImage.service.js";
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

const shortCodesOf = (items: AgendaItemBody[]) => items.flatMap((i) => i.filesToInsert.map((f) => f.tgShortCode));

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
// The mappers produce update semantics: `undefined` = "leave the column alone" (knex drops undefined
// keys), `null` = "store NULL". A field absent from the body is undefined, a field sent blank is
// null, so clearing a field in fndom clears it in the DB. Inserts add `*_INSERT_DEFAULTS` for absent
// NOT NULL / defaulted columns (`withInsertDefaults`).

type Columns<T> = { [K in keyof T]?: T[K] | null };
/** The columns a child soft-delete filters on and writes. */
type ChildRowScope = { itinerary_id: number; record_status: RecordStatus };

/** Absent → undefined; an empty list → NULL; otherwise the JSON. */
const jsonList = (values: string[] | null | undefined) =>
  values === undefined ? undefined : values?.length ? JSON.stringify(values) : null;

/** For columns where 0 has always meant "not set" (budget, duration, day, trip dates): 0 → NULL. */
const zeroAsBlank = (n: number | null | undefined) => (n === undefined ? undefined : n || null);

const asFlag = (b: boolean | undefined) => (b === undefined ? undefined : b ? 1 : 0);

/** knex rejects an UPDATE with no columns (a child sent with only its `id`). */
const hasColumns = (columns: object) => Object.values(columns).some((v) => v !== undefined);

/** The column default for every key the mapper left undefined (absent from the body). */
function withInsertDefaults<T extends object>(columns: Columns<T>, defaults: Columns<T>): Columns<T> {
  const sent = Object.fromEntries(Object.entries(columns).filter(([, v]) => v !== undefined));
  return { ...defaults, ...sent } as Columns<T>;
}

// Same values as the schema defaults, written explicitly on insert.
const ITINERARY_INSERT_DEFAULTS: Columns<ITB_TRAVEL_ITINERARY> = {
  number_of_pax: DEFAULT_NUMBER_OF_PAX,
  duration_in_days: DEFAULT_DURATION_IN_DAYS,
  unknown_date: 0,
};
const AGENDA_INSERT_DEFAULTS: Columns<ITB_TRAVEL_AGENDA_ITEM> = { title: "", unknown_time: 0 };
const BOOKING_INSERT_DEFAULTS: Columns<ITB_TRAVEL_ITINERARY_BOOKING> = {
  item: "",
  booked: 0,
  breakfast: 0,
  sort_order: DEFAULT_BOOKING_SORT_ORDER,
};
const PACKING_INSERT_DEFAULTS: Columns<ITB_TRAVEL_PACKING_ITEM> = {
  label: "",
  category: DEFAULT_PACKING_CATEGORY,
  packed: 0,
};
const NOTE_INSERT_DEFAULTS: Columns<ITB_TRAVEL_NOTE_ITEM> = { label: "", done: 0 };

/** Columns shared by create and update. Pax count and duration can't be blank: blank/0 → 1. */
function itineraryColumns(body: ItineraryFieldsBody): Columns<ITB_TRAVEL_ITINERARY> {
  return {
    destination: body.destination,
    destination_raw: jsonList(body.destinationRaw),
    country: body.country,
    number_of_pax: body.numberOfPax === undefined ? undefined : body.numberOfPax || DEFAULT_NUMBER_OF_PAX,
    itinerary_date_raw: jsonList(body.itineraryDateRaw),
    start_date: zeroAsBlank(body.startDate),
    end_date: zeroAsBlank(body.endDate),
    unknown_date: asFlag(body.unknownDate),
    duration_in_days: body.durationInDays === undefined ? undefined : body.durationInDays || DEFAULT_DURATION_IN_DAYS,
  };
}

/**
 * A `date` sent blank with no `day` also clears `day`: that is how fndom moves an item back to
 * "unscheduled" (`date: ""`, `day` undefined so it's dropped from the JSON), and `day` wins over
 * `date` when fndom groups items. A `day` that was sent (undated trips: `day: 3, date: ""`) is kept.
 */
export function agendaColumns(item: AgendaItemBody): Columns<ITB_TRAVEL_AGENDA_ITEM> {
  const day = item.day === undefined && item.date === null ? null : zeroAsBlank(item.day);
  return {
    category: item.category,
    list_type: item.listType,
    title: item.title,
    desc: item.desc,
    city: item.city,
    city_raw: jsonList(item.cityRaw),
    coordinates_lat: item.coordinates === undefined ? undefined : (item.coordinates?.lat ?? null),
    coordinates_lng: item.coordinates === undefined ? undefined : (item.coordinates?.lng ?? null),
    start_time: item.startTime === undefined ? undefined : (timeToMinutes(item.startTime) ?? null),
    end_time: item.endTime === undefined ? undefined : (timeToMinutes(item.endTime) ?? null),
    duration_in_hours: zeroAsBlank(item.durationInHours),
    unknown_time: asFlag(item.unknownTime),
    budget: zeroAsBlank(item.budget),
    day,
    date: item.date,
  };
}

export function bookingColumns(b: BookingBody): Columns<ITB_TRAVEL_ITINERARY_BOOKING> {
  const paxBreakdown = b.paxBreakdown && Object.keys(b.paxBreakdown).length ? JSON.stringify(b.paxBreakdown) : null;
  return {
    category: b.category,
    item: b.item,
    location: b.remarks,
    link: b.link,
    payment: b.payment,
    start_date: b.startDate,
    end_date: b.endDate,
    nights: b.nights,
    price: b.price,
    booked: asFlag(b.booked),
    free_cancellation: b.freeCancellation,
    breakfast: asFlag(b.breakfast),
    deposit: b.deposit,
    pax_breakdown: b.paxBreakdown === undefined ? undefined : paxBreakdown,
    sort_order: b.sortOrder === undefined ? undefined : (b.sortOrder ?? DEFAULT_BOOKING_SORT_ORDER),
  };
}

/** `sortOrder` = position in the request list. A category sent blank is stored as the default (`misc`). */
export function packingColumns(p: PackingItemBody, sortOrder: number): Columns<ITB_TRAVEL_PACKING_ITEM> {
  return {
    label: p.label,
    category: p.category === undefined ? undefined : (p.category ?? DEFAULT_PACKING_CATEGORY),
    packed: asFlag(p.packed),
    quantity: p.quantity,
    sort_order: sortOrder,
  };
}

export function noteColumns(n: NoteItemBody, sortOrder: number): Columns<ITB_TRAVEL_NOTE_ITEM> {
  return {
    label: n.label,
    category: n.category,
    url: n.url,
    done: asFlag(n.done),
    sort_order: sortOrder,
  };
}

/**
 * Creates and updates trips from fndom's planner payload (the whole trip in one request).
 *
 * Attached images (`_filesToInsert[].tgShortCode`) must exist and, when their uploader is known, be
 * the editor's own uploads (`TgImageService.assertAttachableBy`; 400 / 403 before the transaction).
 *
 * Child rows on update are addressed by client-supplied ids. Any child id (agenda, booking,
 * packing, note; updated or listed for deletion) that isn't this trip's is a 403 before anything
 * is written, and every child update/delete is still scoped by `itinerary_id` inside the trx.
 *
 * Writes run in one transaction through `tx` (the `KnexSqlUtilities` bound to it), so every statement
 * is timed in the request tree under this method's event, plus the commit/rollback line.
 */
export class ItinerarySaveService {
  constructor(
    private db: KnexSqlUtilities,
    private ids: ItineraryIdGenerator = randomIds,
    private images: TgImageService = new TgImageService(db),
  ) {}

  async create(userId: number, body: ItineraryCreateBody, logContext?: IRequestLogContext): Promise<ItinerarySavedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create itinerary");

    if (body.idempotencyKey) {
      const replay = await this.findReplay(userId, body.idempotencyKey, event);
      if (replay) return replay;
    }

    // Checked before the transaction, so a foreign or unknown image is rejected before anything is written.
    await this.images.assertAttachableBy(userId, shortCodesOf(body.agendaItems), logContext);

    const sessionId = this.ids.sessionId();
    const shortCode = this.ids.shortCode();
    const now = Date.now();

    const agendaToFileMap = await this.db.transaction(async (_trx, tx) => {
      const itineraryId = await tx.insertId<Columns<ITB_TRAVEL_ITINERARY>>(
        ITINERARY_TABLE,
        {
          ...withInsertDefaults(itineraryColumns(body), ITINERARY_INSERT_DEFAULTS),
          session_id: sessionId,
          short_code: shortCode,
          idempotency_key: body.idempotencyKey ?? undefined,
          session_title: body.sessionTitle,
          challenge: body.challenge ?? undefined,
          pax_names: jsonList(body.paxNames) ?? undefined,
          created_dt: now,
          created_by_id: userId,
          record_status: RecordStatus.ACTIVE,
        },
        event,
      );
      const map = await this.saveAgenda(tx, itineraryId, body.agendaItems, now, event);
      await this.saveBookings(tx, itineraryId, body.bookings, now, event);
      await this.savePacking(tx, itineraryId, body.packingItems, now, event);
      await this.saveNotes(tx, itineraryId, body.noteItems, now, event);
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

    // Checked before the transaction, so a foreign id or image is rejected before anything is written.
    await this.assertChildrenOwned(itineraryId, body, event);
    await this.images.assertAttachableBy(userId, shortCodesOf(body.agendaItems), logContext);

    const now = Date.now();
    const agendaToFileMap = await this.db.transaction(async (_trx, tx) => {
      await tx.updateCount<Columns<ITB_TRAVEL_ITINERARY>>(
        ITINERARY_TABLE,
        { id: itineraryId },
        {
          ...itineraryColumns(body),
          session_title: body.sessionTitle || itinerary.session_title,
          challenge: body.challenge === undefined ? itinerary.challenge : body.challenge || null,
          pax_names: jsonList(body.paxNames),
        },
        event,
      );

      await this.softDelete(tx, AGENDA_ITEM_TABLE, itineraryId, body.agendaIdsToDelete, event);
      const map = await this.saveAgenda(tx, itineraryId, body.agendaItems, now, event);
      await this.softDelete(tx, BOOKING_TABLE, itineraryId, body.bookingIdsToDelete, event);
      await this.saveBookings(tx, itineraryId, body.bookings, now, event);
      await this.softDelete(tx, PACKING_ITEM_TABLE, itineraryId, body.packingIdsToDelete, event);
      await this.savePacking(tx, itineraryId, body.packingItems, now, event);
      await this.softDelete(tx, NOTE_ITEM_TABLE, itineraryId, body.noteIdsToDelete, event);
      await this.saveNotes(tx, itineraryId, body.noteItems, now, event);
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
    const existing = await this.db.findOne<ITB_TRAVEL_ITINERARY>(
      ITINERARY_TABLE,
      { idempotency_key: idempotencyKey, created_by_id: userId },
      ["id", "session_id", "short_code"],
      event,
    );
    if (!existing) return undefined;
    const agenda = await this.db.find<ITB_TRAVEL_AGENDA_ITEM>(
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

  /** Soft-deletes `ids` among this trip's rows (no statement for an empty list). */
  private async softDelete(
    tx: KnexSqlUtilities,
    table: string,
    itineraryId: number,
    ids: number[],
    event?: IRequestLogEvent,
  ): Promise<void> {
    await tx.updateCountIn<ChildRowScope>(
      table,
      { itinerary_id: itineraryId },
      "id",
      ids,
      { record_status: RecordStatus.DELETED },
      event,
    );
  }

  /** Updates (scoped by `itinerary_id`) or inserts each item, then attaches its new files. */
  private async saveAgenda(
    tx: KnexSqlUtilities,
    itineraryId: number,
    items: AgendaItemBody[],
    now: number,
    event?: IRequestLogEvent,
  ): Promise<AgendaFileMapEntryDto[]> {
    const map: AgendaFileMapEntryDto[] = [];
    const fileRows: Partial<ITB_TRAVEL_AGENDA_FILE>[] = [];
    const fileUuids = items.flatMap((i) => i.filesToInsert.map((f) => f.uuid));
    const attachedRows = fileUuids.length
      ? await tx.find<ITB_TRAVEL_AGENDA_FILE>(
          AGENDA_FILE_TABLE,
          { record_status: RecordStatus.ACTIVE },
          { columns: ["uuid"], extraWhere: (qb) => qb.whereIn("uuid", fileUuids) },
          event,
        )
      : [];
    const attached = new Set<string>(attachedRows.map((r) => r.uuid));

    for (const item of items) {
      let agendaId: number;
      if (item.id !== null) {
        agendaId = item.id;
        const columns = agendaColumns(item);
        if (hasColumns(columns)) {
          await tx.updateCount<Columns<ITB_TRAVEL_AGENDA_ITEM>>(
            AGENDA_ITEM_TABLE,
            { id: agendaId, itinerary_id: itineraryId },
            columns,
            event,
          );
        }
      } else {
        agendaId = await tx.insertId<Columns<ITB_TRAVEL_AGENDA_ITEM>>(
          AGENDA_ITEM_TABLE,
          {
            ...withInsertDefaults(agendaColumns(item), AGENDA_INSERT_DEFAULTS),
            itinerary_id: itineraryId,
            created_dt: now,
            record_status: RecordStatus.ACTIVE,
          },
          event,
        );
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

    await tx.insertMany(AGENDA_FILE_TABLE, fileRows, event);
    return map;
  }

  private async saveBookings(
    tx: KnexSqlUtilities,
    itineraryId: number,
    bookings: BookingBody[],
    now: number,
    event?: IRequestLogEvent,
  ) {
    const inserts: Columns<ITB_TRAVEL_ITINERARY_BOOKING>[] = [];
    for (const b of bookings) {
      if (b.id !== null) {
        const columns = bookingColumns(b);
        if (hasColumns(columns)) {
          await tx.updateCount<Columns<ITB_TRAVEL_ITINERARY_BOOKING>>(
            BOOKING_TABLE,
            { id: b.id, itinerary_id: itineraryId },
            columns,
            event,
          );
        }
      } else {
        inserts.push({
          ...withInsertDefaults(bookingColumns(b), BOOKING_INSERT_DEFAULTS),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
    }
    await tx.insertMany(BOOKING_TABLE, inserts, event);
  }

  private async savePacking(
    tx: KnexSqlUtilities,
    itineraryId: number,
    items: PackingItemBody[],
    now: number,
    event?: IRequestLogEvent,
  ) {
    const inserts: Columns<ITB_TRAVEL_PACKING_ITEM>[] = [];
    for (const [index, p] of items.entries()) {
      if (p.id !== null) {
        await tx.updateCount<Columns<ITB_TRAVEL_PACKING_ITEM>>(
          PACKING_ITEM_TABLE,
          { id: p.id, itinerary_id: itineraryId },
          packingColumns(p, index),
          event,
        );
      } else {
        inserts.push({
          ...withInsertDefaults(packingColumns(p, index), PACKING_INSERT_DEFAULTS),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
    }
    await tx.insertMany(PACKING_ITEM_TABLE, inserts, event);
  }

  private async saveNotes(
    tx: KnexSqlUtilities,
    itineraryId: number,
    items: NoteItemBody[],
    now: number,
    event?: IRequestLogEvent,
  ) {
    const inserts: Columns<ITB_TRAVEL_NOTE_ITEM>[] = [];
    for (const [index, n] of items.entries()) {
      if (n.id !== null) {
        await tx.updateCount<Columns<ITB_TRAVEL_NOTE_ITEM>>(
          NOTE_ITEM_TABLE,
          { id: n.id, itinerary_id: itineraryId },
          noteColumns(n, index),
          event,
        );
      } else {
        inserts.push({
          ...withInsertDefaults(noteColumns(n, index), NOTE_INSERT_DEFAULTS),
          itinerary_id: itineraryId,
          created_dt: now,
          record_status: RecordStatus.ACTIVE,
        });
      }
    }
    await tx.insertMany(NOTE_ITEM_TABLE, inserts, event);
  }
}
