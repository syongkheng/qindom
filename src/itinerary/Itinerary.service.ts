import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_TRAVEL_ITINERARY } from "../models/databases/tb_travel_itinerary.js";
import { ITB_TRAVEL_AGENDA_ITEM } from "../models/databases/tb_travel_agenda_item.js";
import { ITB_TRAVEL_AGENDA_FILE } from "../models/databases/tb_travel_agenda_file.js";
import { ITB_TRAVEL_ITINERARY_VIEW } from "../models/databases/tb_travel_itinerary_view.js";
import { ITB_TRAVEL_ITINERARY_BOOKING } from "../models/databases/tb_travel_itinerary_booking.js";
import { ITB_TRAVEL_PACKING_ITEM } from "../models/databases/tb_travel_packing_item.js";
import { ITB_TRAVEL_NOTE_ITEM } from "../models/databases/tb_travel_note_item.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import {
  ItineraryAgendaFileDto,
  ItineraryAgendaItemDto,
  ItineraryBookingDto,
  ItineraryChallengeRequiredDto,
  ItineraryDeletedDto,
  ItineraryDto,
  ItineraryListDto,
  ItineraryNoteItemDto,
  ItineraryPackingItemDto,
  ItinerarySummaryDto,
  PublicItineraryDto,
} from "./Itinerary.types.js";

export const ITINERARY_TABLE = "tb_travel_itinerary";
export const AGENDA_ITEM_TABLE = "tb_travel_agenda_item";
export const AGENDA_FILE_TABLE = "tb_travel_agenda_file";
export const BOOKING_TABLE = "tb_travel_itinerary_booking";
export const PACKING_ITEM_TABLE = "tb_travel_packing_item";
export const NOTE_ITEM_TABLE = "tb_travel_note_item";
const ITINERARY_VIEW_TABLE = "tb_travel_itinerary_view";

const SUMMARY_COLUMNS = [
  "id",
  "session_id",
  "short_code",
  "session_title",
  "destination",
  "start_date",
  "end_date",
  "number_of_pax",
] as const;
/** Metadata only: blobs never leave the server (images are served by `/img/:shortCode`). */
const FILE_COLUMNS = ["id", "uuid", "agenda_item_id", "name", "mime_type", "size_in_bytes", "tg_short_code"] as const;
/** Shown when a packing item has no category (also the stored default). */
export const DEFAULT_PACKING_CATEGORY = "misc";
const MINUTES_PER_HOUR = 60;
// tb_travel_itinerary_view.ip_address VARCHAR(64); user_agent is TEXT but capped so a client can't bloat it.
const VIEW_IP_MAX_LENGTH = 64;
const VIEW_USER_AGENT_MAX_LENGTH = 512;

type SummaryRow = Pick<ITB_TRAVEL_ITINERARY, (typeof SUMMARY_COLUMNS)[number]>;
type FileRow = Pick<ITB_TRAVEL_AGENDA_FILE, (typeof FILE_COLUMNS)[number]>;
/** Agenda columns as mysql2 returns them (DECIMAL → string). */
type AgendaRow = Omit<
  ITB_TRAVEL_AGENDA_ITEM,
  "budget" | "duration_in_hours" | "coordinates_lat" | "coordinates_lng"
> & {
  budget?: string | number | null;
  duration_in_hours?: string | number | null;
  coordinates_lat?: string | number | null;
  coordinates_lng?: string | number | null;
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** "HH:MM" → minutes since midnight (stored in `start_time` / `end_time`). */
export function timeToMinutes(time: string | null): number | undefined {
  if (!time) return undefined;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * MINUTES_PER_HOUR + m;
}

export function minutesToTime(minutes: number | null | undefined): string | undefined {
  if (minutes == null) return undefined;
  const h = Math.floor(minutes / MINUTES_PER_HOUR)
    .toString()
    .padStart(2, "0");
  const m = (minutes % MINUTES_PER_HOUR).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** JSON columns written by this module; a corrupt value reads as `fallback` instead of failing the whole trip. */
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function toItinerarySummaryDto(row: SummaryRow): ItinerarySummaryDto {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    destination: row.destination ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    numberOfPax: row.number_of_pax ?? null,
    shortCode: row.short_code,
  };
}

export function toAgendaFileDto(row: FileRow): ItineraryAgendaFileDto {
  return {
    id: Number(row.id),
    uuid: row.uuid,
    name: row.name ?? null,
    mime_type: row.mime_type ?? null,
    size_in_bytes: row.size_in_bytes ?? null,
    tg_short_code: row.tg_short_code,
  };
}

export function toAgendaItemDto(row: AgendaRow, files: ItineraryAgendaFileDto[]): ItineraryAgendaItemDto {
  const hasCoordinates = row.coordinates_lat != null && row.coordinates_lng != null;
  return {
    id: Number(row.id),
    itinerary_id: Number(row.itinerary_id),
    category: row.category ?? null,
    list_type: row.list_type ?? null,
    title: row.title,
    desc: row.desc ?? null,
    city: row.city ?? null,
    city_raw: row.city_raw ?? null,
    start_time: minutesToTime(row.start_time),
    end_time: minutesToTime(row.end_time),
    duration_in_hours: row.duration_in_hours ?? null,
    unknown_time: row.unknown_time ?? null,
    budget: row.budget ?? null,
    day: row.day ?? null,
    date: row.date ?? null,
    coordinates: hasCoordinates ? { lat: Number(row.coordinates_lat), lng: Number(row.coordinates_lng) } : undefined,
    files,
  };
}

export function toBookingDto(row: ITB_TRAVEL_ITINERARY_BOOKING): ItineraryBookingDto {
  return {
    id: Number(row.id),
    itineraryId: Number(row.itinerary_id),
    category: row.category ?? null,
    item: row.item,
    remarks: row.location ?? null,
    link: row.link ?? null,
    payment: row.payment ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    nights: row.nights ?? null,
    price: row.price != null ? Number(row.price) : undefined,
    booked: !!row.booked,
    freeCancellation: row.free_cancellation ?? null,
    breakfast: !!row.breakfast,
    deposit: row.deposit ?? null,
    paxBreakdown: parseJson<Record<string, number> | undefined>(row.pax_breakdown, undefined),
    sortOrder: row.sort_order ?? null,
  };
}

export function toPackingItemDto(row: ITB_TRAVEL_PACKING_ITEM): ItineraryPackingItemDto {
  return {
    id: Number(row.id),
    label: row.label,
    category: row.category ?? DEFAULT_PACKING_CATEGORY,
    packed: !!row.packed,
    quantity: row.quantity ?? undefined,
  };
}

export function toNoteItemDto(row: ITB_TRAVEL_NOTE_ITEM): ItineraryNoteItemDto {
  return {
    id: Number(row.id),
    label: row.label,
    category: row.category ?? undefined,
    url: row.url ?? undefined,
    done: !!row.done,
  };
}

export function toItineraryDto(
  row: ITB_TRAVEL_ITINERARY,
  children: Pick<ItineraryDto, "agendaItems" | "bookings" | "packingItems" | "noteItems">,
): ItineraryDto {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    shortCode: row.short_code,
    destination: row.destination ?? null,
    destinationRaw: row.destination_raw ?? null,
    country: row.country ?? null,
    numberOfPax: row.number_of_pax ?? null,
    itineraryDateRaw: row.itinerary_date_raw ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    unknownDate: !!row.unknown_date,
    durationInDays: row.duration_in_days ?? null,
    challenge: row.challenge ?? null,
    paxNames: parseJson<string[]>(row.pax_names, []),
    ...children,
  };
}

/** The owner's view minus the internal ids, the owner's `sessionId` and the access code (agenda item ids stay, see the type). */
export function toPublicItineraryDto(trip: ItineraryDto, viewCount: number): PublicItineraryDto {
  const { id, sessionId, challenge, agendaItems, bookings, packingItems, noteItems, ...fields } = trip;
  return {
    ...fields,
    viewCount,
    agendaItems: agendaItems.map(({ itinerary_id, files, ...item }) => ({
      ...item,
      files: files.map(({ id: fileId, ...file }) => file),
    })),
    bookings: bookings.map(({ id: bookingId, itineraryId, ...booking }) => booking),
    packingItems: packingItems.map(({ id: packingId, ...item }) => item),
    noteItems: noteItems.map(({ id: noteId, ...item }) => item),
  };
}

// ── Shared lookups ────────────────────────────────────────────────────────────

/** The active trip with this sessionId, owned by `userId`: 404 if missing/deleted, 403 if someone else's. */
export async function findOwnedItinerary(
  db: KnexSqlUtilities,
  userId: number,
  sessionId: string,
  event?: IRequestLogEvent,
): Promise<ITB_TRAVEL_ITINERARY> {
  const itinerary = await db.findOne<ITB_TRAVEL_ITINERARY>(
    ITINERARY_TABLE,
    { session_id: sessionId, record_status: RecordStatus.ACTIVE },
    ["*"],
    event,
  );
  if (!itinerary) throw new Exceptions.NotFound("Itinerary not found");
  if (Number(itinerary.created_by_id) !== userId) throw new Exceptions.ForbiddenAccess();
  return itinerary;
}

/**
 * Trip reads (owner) and the public share flow (`short_code` + optional 6-char access code).
 * Writes (create / update) are in `ItinerarySaveService`.
 */
export class ItineraryService {
  constructor(private db: KnexSqlUtilities) {}

  async listTrips(userId: number, logContext?: IRequestLogContext): Promise<ItineraryListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List itineraries");
    const rows: SummaryRow[] = await this.db.find<ITB_TRAVEL_ITINERARY>(
      ITINERARY_TABLE,
      { record_status: RecordStatus.ACTIVE, created_by_id: userId },
      { orderBy: "created_dt", orderDirection: "desc", columns: SUMMARY_COLUMNS },
      event,
    );
    if (event) event.detail = `${rows.length} trip(s)`;
    return { myTrips: rows.map(toItinerarySummaryDto), sharedTrips: [] };
  }

  async getBySessionId(userId: number, sessionId: string, logContext?: IRequestLogContext): Promise<ItineraryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Load own itinerary");
    const itinerary = await findOwnedItinerary(this.db, userId, sessionId, event);
    return toItineraryDto(itinerary, await this.loadChildren(itinerary, event));
  }

  async deleteTrip(userId: number, sessionId: string, logContext?: IRequestLogContext): Promise<ItineraryDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete itinerary");
    const itinerary = await findOwnedItinerary(this.db, userId, sessionId, event);
    await this.db.update<ITB_TRAVEL_ITINERARY>(
      ITINERARY_TABLE,
      { id: itinerary.id },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { deleted: true };
  }

  /** Public viewer: the full trip, or only `{ hasChallenge: true }` when it has an access code. */
  async getByShortCode(
    shortCode: string,
    logContext?: IRequestLogContext,
  ): Promise<PublicItineraryDto | ItineraryChallengeRequiredDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Load shared itinerary");
    const itinerary = await this.findByShortCode(shortCode, event);
    if (itinerary.challenge) {
      if (event) event.detail = "access code required";
      return { hasChallenge: true };
    }
    return this.loadPublic(itinerary, event);
  }

  /** Unlocks a protected trip. A wrong code is a 400 so it counts towards `itineraryChallengeLimiter`. */
  async verifyChallenge(
    shortCode: string,
    challenge: string,
    logContext?: IRequestLogContext,
  ): Promise<PublicItineraryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Verify access code");
    const itinerary = await this.findByShortCode(shortCode, event);
    if (itinerary.challenge !== challenge) throw new Exceptions.InvalidRequest("challenge");
    return this.loadPublic(itinerary, event);
  }

  /** Fire-and-forget view counter: never throws (callers don't await it). */
  async recordView(shortCode: string, ipAddress: string, userAgent: string): Promise<void> {
    try {
      await this.db.insert<ITB_TRAVEL_ITINERARY_VIEW>(ITINERARY_VIEW_TABLE, {
        short_code: shortCode,
        ip_address: ipAddress.slice(0, VIEW_IP_MAX_LENGTH),
        user_agent: userAgent.slice(0, VIEW_USER_AGENT_MAX_LENGTH),
        viewed_at: Date.now(),
      });
    } catch (err) {
      LoggingUtilities.service.warn(
        "ItineraryService.recordView",
        `Failed to record view for ${shortCode}: ${toMessage(err)}`,
      );
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async findByShortCode(shortCode: string, event?: IRequestLogEvent): Promise<ITB_TRAVEL_ITINERARY> {
    const itinerary = await this.db.findOne<ITB_TRAVEL_ITINERARY>(
      ITINERARY_TABLE,
      { short_code: shortCode, record_status: RecordStatus.ACTIVE },
      ["*"],
      event,
    );
    if (!itinerary) throw new Exceptions.NotFound("Itinerary not found");
    return itinerary;
  }

  private async loadPublic(itinerary: ITB_TRAVEL_ITINERARY, event?: IRequestLogEvent): Promise<PublicItineraryDto> {
    const [children, viewCount] = await Promise.all([
      this.loadChildren(itinerary, event),
      this.db.count<ITB_TRAVEL_ITINERARY_VIEW>(ITINERARY_VIEW_TABLE, { short_code: itinerary.short_code }, event),
    ]);
    return toPublicItineraryDto(toItineraryDto(itinerary, children), viewCount);
  }

  /** Active agenda items (with file metadata), bookings, packing and notes, each in its stored order. */
  private async loadChildren(
    itinerary: ITB_TRAVEL_ITINERARY,
    event?: IRequestLogEvent,
  ): Promise<Pick<ItineraryDto, "agendaItems" | "bookings" | "packingItems" | "noteItems">> {
    const byItinerary = { itinerary_id: itinerary.id, record_status: RecordStatus.ACTIVE };
    const bySortOrder = { orderBy: "sort_order", orderDirection: "asc" } as const;
    const agendaRows = await this.db.find<AgendaRow>(
      AGENDA_ITEM_TABLE,
      byItinerary,
      { orderBy: "id", orderDirection: "asc" },
      event,
    );
    const agendaIds = agendaRows.map((a) => Number(a.id));
    const [fileRows, bookings, packingItems, noteItems] = await Promise.all([
      agendaIds.length
        ? this.db.find<ITB_TRAVEL_AGENDA_FILE>(
            AGENDA_FILE_TABLE,
            { record_status: RecordStatus.ACTIVE },
            { columns: FILE_COLUMNS, extraWhere: (qb) => qb.whereIn("agenda_item_id", agendaIds) },
            event,
          )
        : Promise.resolve<FileRow[]>([]),
      this.db.find<ITB_TRAVEL_ITINERARY_BOOKING>(BOOKING_TABLE, byItinerary, bySortOrder, event),
      this.db.find<ITB_TRAVEL_PACKING_ITEM>(PACKING_ITEM_TABLE, byItinerary, bySortOrder, event),
      this.db.find<ITB_TRAVEL_NOTE_ITEM>(NOTE_ITEM_TABLE, byItinerary, bySortOrder, event),
    ]);

    const filesByAgendaId = new Map<number, ItineraryAgendaFileDto[]>();
    for (const file of fileRows) {
      const key = Number(file.agenda_item_id);
      filesByAgendaId.set(key, [...(filesByAgendaId.get(key) ?? []), toAgendaFileDto(file)]);
    }
    return {
      agendaItems: agendaRows.map((a) => toAgendaItemDto(a, filesByAgendaId.get(Number(a.id)) ?? [])),
      bookings: bookings.map(toBookingDto),
      packingItems: packingItems.map(toPackingItemDto),
      noteItems: noteItems.map(toNoteItemDto),
    };
  }
}
