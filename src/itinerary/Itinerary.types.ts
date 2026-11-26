/** `tb_travel_agenda_item.list_type`: "Things to do" vs "Places to visit". Null on old/manual rows (fndom treats it as todo). */
export const AgendaListType = {
  TODO: "todo",
  PLACE: "place",
} as const;

export type AgendaListType = (typeof AgendaListType)[keyof typeof AgendaListType];

export interface CoordinatesDto {
  lat: number;
  lng: number;
}

// ── Responses ──

/** One trip card of `GET /itinerary`. */
export interface ItinerarySummaryDto {
  id: number;
  sessionId: string;
  sessionTitle: string;
  destination: string | null;
  startDate: number | null;
  endDate: number | null;
  numberOfPax: number | null;
  shortCode: string;
}

export interface ItineraryListDto {
  /** The caller's trips, newest first. */
  myTrips: ItinerarySummaryDto[];
  /** Always empty: sharing with other accounts isn't built. fndom still reads the field. */
  sharedTrips: ItinerarySummaryDto[];
}

/**
 * File metadata only (images are served by `GET /img/:shortCode`, never inline).
 * snake_case on purpose: fndom's planner/viewer read these names (`tg_short_code`, `mime_type`).
 */
export interface ItineraryAgendaFileDto {
  id: number;
  uuid: string;
  name: string | null;
  mime_type: string | null;
  size_in_bytes: number | null;
  tg_short_code: string;
}

/**
 * An agenda item. Kept snake_case (the column names) because many fndom components read
 * `start_time`, `unknown_time`, `city_raw`, `list_type` directly; see README "Contract notes".
 */
export interface ItineraryAgendaItemDto {
  id: number;
  itinerary_id: number;
  category: string | null;
  list_type: AgendaListType | null;
  title: string;
  desc: string | null;
  city: string | null;
  /** JSON-encoded string[] as stored. */
  city_raw: string | null;
  /** "HH:MM"; omitted when unset. */
  start_time?: string;
  end_time?: string;
  /** DECIMAL(6,2) as a number (null when unset). */
  duration_in_hours: number | null;
  /** TINYINT 0/1. */
  unknown_time: number | null;
  /** DECIMAL(12,2) as a number (null when unset). */
  budget: number | null;
  day: number | null;
  date: string | null;
  /** Omitted when the item has no coordinates. */
  coordinates?: CoordinatesDto;
  files: ItineraryAgendaFileDto[];
}

export interface ItineraryBookingDto {
  id: number;
  itineraryId: number;
  category: string | null;
  item: string;
  /** Stored in the `location` column. */
  remarks: string | null;
  link: string | null;
  payment: string | null;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  price?: number;
  booked: boolean;
  freeCancellation: string | null;
  breakfast: boolean;
  deposit: string | null;
  paxBreakdown?: Record<string, number>;
  sortOrder: number | null;
}

export interface ItineraryPackingItemDto {
  id: number;
  label: string;
  category: string;
  packed: boolean;
  quantity?: number;
}

export interface ItineraryNoteItemDto {
  id: number;
  label: string;
  category?: string;
  url?: string;
  done: boolean;
}

/** A full trip for its owner: `GET /:sessionId`. The public views get `PublicItineraryDto`. */
export interface ItineraryDto {
  id: number;
  sessionId: string;
  sessionTitle: string;
  shortCode: string;
  destination: string | null;
  /** JSON-encoded string[] as stored (fndom parses it). */
  destinationRaw: string | null;
  country: string | null;
  numberOfPax: number | null;
  /** JSON-encoded string[] as stored (fndom parses it). */
  itineraryDateRaw: string | null;
  startDate: number | null;
  endDate: number | null;
  unknownDate: boolean;
  durationInDays: number | null;
  /** The 6-char access code; null when the trip is public. */
  challenge: string | null;
  paxNames: string[];
  bookings: ItineraryBookingDto[];
  packingItems: ItineraryPackingItemDto[];
  noteItems: ItineraryNoteItemDto[];
  agendaItems: ItineraryAgendaItemDto[];
}

// Public views (`GET /v/:shortCode`, `POST /challenge`): no internal ids, no owner `sessionId`, no access code.
// Agenda item `id` is kept: fndom's ICS export (useTravelExport) uses it as the stable event UID.

export type PublicAgendaFileDto = Omit<ItineraryAgendaFileDto, "id">;

export interface PublicAgendaItemDto extends Omit<ItineraryAgendaItemDto, "itinerary_id" | "files"> {
  files: PublicAgendaFileDto[];
}

export type PublicBookingDto = Omit<ItineraryBookingDto, "id" | "itineraryId">;
export type PublicPackingItemDto = Omit<ItineraryPackingItemDto, "id">;
export type PublicNoteItemDto = Omit<ItineraryNoteItemDto, "id">;

export interface PublicItineraryDto extends Omit<
  ItineraryDto,
  "id" | "sessionId" | "challenge" | "agendaItems" | "bookings" | "packingItems" | "noteItems"
> {
  viewCount: number;
  agendaItems: PublicAgendaItemDto[];
  bookings: PublicBookingDto[];
  packingItems: PublicPackingItemDto[];
  noteItems: PublicNoteItemDto[];
}

/** `GET /v/:shortCode` on a protected trip: unlock it with `POST /challenge`. */
export interface ItineraryChallengeRequiredDto {
  hasChallenge: true;
}

export interface AgendaFileMapEntryDto {
  agendaId: number;
  /** uuids of the files listed in that item's `_filesToInsert` (attached now or already attached). */
  fileUuids: string[];
}

/** `POST /itinerary` and `POST /:sessionId/update`. */
export interface ItinerarySavedDto {
  shortCode: string;
  sessionId: string;
  /** One entry per request agenda item, in request order (fndom matches them by index). */
  agendaToFileMap: AgendaFileMapEntryDto[];
}

export interface ItineraryDeletedDto {
  deleted: true;
}

// ── Request bodies ──
// Text fields are trimmed. Update semantics (see README "Request bodies"): a field that is absent
// (undefined) leaves the stored value alone; a field sent blank ("" / null) is stored as NULL.

/** undefined = absent (unchanged on update, column default on create); null = sent blank (stored as NULL). */
export type OptionalField<T> = T | null | undefined;

/** One entry of an agenda item's `_filesToInsert`: an image already uploaded through `POST /img/upload`. */
export interface AgendaFileBody {
  uuid: string;
  tgShortCode: string;
  mimeType: string;
  name: string | null;
  sizeInBytes: number | null;
}

export interface AgendaItemBody {
  /** Existing item id (update) or null (insert). */
  id: number | null;
  category: OptionalField<string>;
  listType: OptionalField<AgendaListType>;
  /** NOT NULL column: blank is stored as "". */
  title: string | undefined;
  desc: OptionalField<string>;
  city: OptionalField<string>;
  cityRaw: OptionalField<string[]>;
  coordinates: OptionalField<CoordinatesDto>;
  /** "HH:MM" */
  startTime: OptionalField<string>;
  endTime: OptionalField<string>;
  durationInHours: OptionalField<number>;
  unknownTime: boolean | undefined;
  budget: OptionalField<number>;
  day: OptionalField<number>;
  date: OptionalField<string>;
  filesToInsert: AgendaFileBody[];
}

export interface BookingBody {
  id: number | null;
  category: OptionalField<string>;
  /** NOT NULL column: blank is stored as "". */
  item: string | undefined;
  remarks: OptionalField<string>;
  link: OptionalField<string>;
  payment: OptionalField<string>;
  startDate: OptionalField<string>;
  endDate: OptionalField<string>;
  nights: OptionalField<number>;
  price: OptionalField<number>;
  booked: boolean | undefined;
  freeCancellation: OptionalField<string>;
  breakfast: boolean | undefined;
  deposit: OptionalField<string>;
  paxBreakdown: OptionalField<Record<string, unknown>>;
  sortOrder: OptionalField<number>;
}

export interface PackingItemBody {
  id: number | null;
  label: string | undefined;
  category: OptionalField<string>;
  packed: boolean | undefined;
  quantity: OptionalField<number>;
}

export interface NoteItemBody {
  id: number | null;
  label: string | undefined;
  category: OptionalField<string>;
  url: OptionalField<string>;
  done: boolean | undefined;
}

/** Trip-level fields shared by create and update. */
export interface ItineraryFieldsBody {
  destination: OptionalField<string>;
  destinationRaw: OptionalField<string[]>;
  country: OptionalField<string>;
  numberOfPax: OptionalField<number>;
  itineraryDateRaw: OptionalField<string[]>;
  startDate: OptionalField<number>;
  endDate: OptionalField<number>;
  unknownDate: boolean | undefined;
  durationInDays: OptionalField<number>;
  agendaItems: AgendaItemBody[];
  bookings: BookingBody[];
  packingItems: PackingItemBody[];
  noteItems: NoteItemBody[];
}

export interface ItineraryCreateBody extends ItineraryFieldsBody {
  idempotencyKey: string | null;
  sessionTitle: string;
  /** null = no access code. */
  challenge: string | null;
  paxNames: string[] | null;
}

export interface ItineraryUpdateBody extends ItineraryFieldsBody {
  /** null keeps the current title. */
  sessionTitle: string | null;
  /** undefined keeps the current code, null (or "") removes it. */
  challenge: string | null | undefined;
  /** undefined keeps the current names, an empty list clears them. */
  paxNames: string[] | undefined;
  agendaIdsToDelete: number[];
  bookingIdsToDelete: number[];
  packingIdsToDelete: number[];
  noteIdsToDelete: number[];
}

export interface ItineraryChallengeBody {
  shortCode: string;
  challenge: string;
}
