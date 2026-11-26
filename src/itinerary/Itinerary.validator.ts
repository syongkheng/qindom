import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import {
  AgendaFileBody,
  AgendaItemBody,
  AgendaListType,
  BookingBody,
  CoordinatesDto,
  ItineraryChallengeBody,
  ItineraryCreateBody,
  ItineraryFieldsBody,
  ItineraryUpdateBody,
  NoteItemBody,
  PackingItemBody,
} from "./Itinerary.types.js";

type Body = Record<string, unknown>;

// ── Column widths ──
// tb_travel_itinerary
const IDEMPOTENCY_KEY_MAX_LENGTH = 64; // idempotency_key VARCHAR(64)
const SESSION_TITLE_MAX_LENGTH = 512; // session_title VARCHAR(512)
const DESTINATION_MAX_LENGTH = 512; // destination VARCHAR(512)
const COUNTRY_MAX_LENGTH = 256; // country VARCHAR(256)
const SHORT_CODE_MAX_LENGTH = 16; // short_code VARCHAR(16)
const CHALLENGE_MAX_LENGTH = 6; // challenge VARCHAR(6)
// tb_travel_agenda_item
const AGENDA_CATEGORY_MAX_LENGTH = 32; // category VARCHAR(32)
const AGENDA_TITLE_MAX_LENGTH = 512; // title VARCHAR(512)
const AGENDA_CITY_MAX_LENGTH = 512; // city VARCHAR(512)
const AGENDA_DATE_MAX_LENGTH = 32; // date VARCHAR(32)
const DURATION_HOURS_MAX = 9_999.99; // duration_in_hours DECIMAL(6,2)
// tb_travel_agenda_file
const FILE_UUID_MAX_LENGTH = 36; // uuid VARCHAR(36)
const FILE_TG_SHORT_CODE_MAX_LENGTH = 16; // tg_short_code VARCHAR(16)
const FILE_NAME_MAX_LENGTH = 255; // name VARCHAR(255)
const FILE_MIME_TYPE_MAX_LENGTH = 100; // mime_type VARCHAR(100)
// tb_travel_itinerary_booking
const BOOKING_CATEGORY_MAX_LENGTH = 32; // category VARCHAR(32)
const BOOKING_ITEM_MAX_LENGTH = 512; // item VARCHAR(512)
const BOOKING_REMARKS_MAX_LENGTH = 128; // location VARCHAR(128) (holds `remarks`)
const BOOKING_LINK_MAX_LENGTH = 1024; // link VARCHAR(1024)
const BOOKING_PAYMENT_MAX_LENGTH = 256; // payment VARCHAR(256)
const BOOKING_DATE_MAX_LENGTH = 32; // start_date / end_date VARCHAR(32)
const BOOKING_FREE_CANCELLATION_MAX_LENGTH = 256; // free_cancellation VARCHAR(256)
const BOOKING_DEPOSIT_MAX_LENGTH = 128; // deposit VARCHAR(128)
// tb_travel_packing_item
const PACKING_LABEL_MAX_LENGTH = 255; // label VARCHAR(255)
const PACKING_CATEGORY_MAX_LENGTH = 50; // category VARCHAR(50)
// tb_travel_note_item
const NOTE_LABEL_MAX_LENGTH = 255; // label VARCHAR(255)
const NOTE_CATEGORY_MAX_LENGTH = 64; // category VARCHAR(64)
const NOTE_URL_MAX_LENGTH = 512; // url VARCHAR(512)
// Shared numeric ranges
const INT_MAX = 2_147_483_647; // INT columns (number_of_pax, duration_in_days, nights, quantity, sort_order, size_in_bytes)
const MONEY_MAX_ABS = 9_999_999_999.99; // budget / price DECIMAL(12,2)
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;

/** Images only: tgimage rejects anything else on upload. */
const IMAGE_MIME_PREFIX = "image/";
/** "HH:MM" (seconds tolerated), as sent by fndom's time picker and returned by the GET. */
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;
const INTEGER_STRING_PATTERN = /^\d+$/;
const DECIMAL_STRING_PATTERN = /^-?\d+(\.\d+)?$/;
const AGENDA_LIST_TYPES = Object.values(AgendaListType);

const invalid = (field: string, event?: IRequestLogEvent): never => {
  event?.children.push(`'${field}' invalid`);
  throw new Exceptions.InvalidRequest(field, "format");
};

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/** undefined/null → []; anything but an array → 400. */
function list(value: unknown, field: string, event?: IRequestLogEvent): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : invalid(field, event);
}

function record(value: unknown, field: string, event?: IRequestLogEvent): Body {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Body) : invalid(field, event);
}

/** undefined/null → null; otherwise an array of strings. */
function stringList(value: unknown, field: string, event?: IRequestLogEvent): string[] | null {
  if (value === undefined || value === null) return null;
  const items = list(value, field, event);
  return items.every((v) => typeof v === "string") ? (items as string[]) : invalid(field, event);
}

/** Text that may be blank but must fit the column (stored as "" when blank). */
const text = (value: unknown, field: string, max: number, event?: IRequestLogEvent): string =>
  V.optionalText(value, field, max, event) ?? "";

/**
 * A number (or a numeric string: DECIMAL columns come back from the GET as strings and fndom
 * sends them back unchanged). Blank → null.
 */
function optionalNumber(
  value: unknown,
  field: string,
  { min, max, integer }: { min: number; max: number; integer?: boolean },
  event?: IRequestLogEvent,
): number | null {
  if (isBlank(value)) return null;
  const pattern = integer ? INTEGER_STRING_PATTERN : DECIMAL_STRING_PATTERN;
  const n = typeof value === "number" ? value : typeof value === "string" && pattern.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return invalid(field, event);
  return n;
}

/** Row id from the client (number, or a digit string after fndom's `String(agendaId)`). Blank/0 → null (new row). */
function optionalId(value: unknown, field: string, event?: IRequestLogEvent): number | null {
  return optionalNumber(value, field, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }, event) || null;
}

function idList(value: unknown, field: string, event?: IRequestLogEvent): number[] {
  return list(value, field, event).map((v) => optionalId(v, field, event) ?? invalid(field, event));
}

/** Booleans; also 0/1 because the GET returns TINYINT columns (`unknown_time`) and fndom echoes them. */
function flag(value: unknown, field: string, event?: IRequestLogEvent): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  return invalid(field, event);
}

function optionalTime(value: unknown, field: string, event?: IRequestLogEvent): string | null {
  if (isBlank(value)) return null;
  return typeof value === "string" && TIME_PATTERN.test(value) ? value : invalid(field, event);
}

function coordinates(value: unknown, event?: IRequestLogEvent): CoordinatesDto | null {
  if (value === undefined || value === null) return null;
  const c = record(value, "coordinates", event);
  const lat = optionalNumber(c.lat, "coordinates", { min: -LATITUDE_MAX, max: LATITUDE_MAX }, event);
  const lng = optionalNumber(c.lng, "coordinates", { min: -LONGITUDE_MAX, max: LONGITUDE_MAX }, event);
  return lat === null || lng === null ? invalid("coordinates", event) : { lat, lng };
}

/**
 * `cityRaw` as a string[]: fndom sends an array for new items, and items loaded from the GET
 * carry the stored JSON string in `city_raw`. Unparseable or empty → null.
 */
export function normaliseCityRaw(value: unknown): string[] | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return Array.isArray(parsed) && parsed.length && parsed.every((v) => typeof v === "string") ? parsed : null;
}

/** The access code is compared exactly, so it is not trimmed. */
function challengeCode(value: unknown, event?: IRequestLogEvent): string | null {
  if (isBlank(value)) return null;
  return typeof value === "string" && value.length <= CHALLENGE_MAX_LENGTH ? value : invalid("challenge", event);
}

export function validateAgendaFileBody(value: unknown, event?: IRequestLogEvent): AgendaFileBody {
  const f = record(value, "_filesToInsert", event);
  const mimeType = V.requiredText(f.mimeType, "mimeType", FILE_MIME_TYPE_MAX_LENGTH, event);
  if (!mimeType.toLowerCase().startsWith(IMAGE_MIME_PREFIX)) invalid("mimeType", event);
  return {
    uuid: V.requiredText(f.uuid, "uuid", FILE_UUID_MAX_LENGTH, event),
    tgShortCode: V.requiredText(f.tgShortCode, "tgShortCode", FILE_TG_SHORT_CODE_MAX_LENGTH, event),
    mimeType,
    name: V.optionalText(f.name, "name", FILE_NAME_MAX_LENGTH, event),
    sizeInBytes: optionalNumber(f.sizeInBytes, "sizeInBytes", { min: 0, max: INT_MAX, integer: true }, event),
  };
}

/** Accepts both the camelCase fields fndom edits and the snake_case ones the GET returns. */
export function validateAgendaItemBody(value: unknown, event?: IRequestLogEvent): AgendaItemBody {
  const a = record(value, "agendaItems", event);
  const listType = a.listType ?? a.list_type;
  if (!isBlank(listType)) V.oneOf(listType, AGENDA_LIST_TYPES, "listType", event, "(O)");
  return {
    id: optionalId(a.id, "agendaItems.id", event),
    category: V.optionalText(a.category, "category", AGENDA_CATEGORY_MAX_LENGTH, event),
    listType: isBlank(listType) ? null : (listType as AgendaListType),
    title: text(a.title, "title", AGENDA_TITLE_MAX_LENGTH, event),
    desc: isBlank(a.desc) ? null : typeof a.desc === "string" ? a.desc : invalid("desc", event),
    city: V.optionalText(a.city, "city", AGENDA_CITY_MAX_LENGTH, event),
    cityRaw: normaliseCityRaw(a.cityRaw ?? a.city_raw),
    coordinates: coordinates(a.coordinates, event),
    startTime: optionalTime(a.startTime ?? a.start_time, "startTime", event),
    endTime: optionalTime(a.endTime ?? a.end_time, "endTime", event),
    durationInHours: optionalNumber(
      a.durationInHours ?? a.duration_in_hours,
      "durationInHours",
      { min: 0, max: DURATION_HOURS_MAX },
      event,
    ),
    unknownTime: flag(a.unknownTime ?? a.unknown_time, "unknownTime", event),
    budget: optionalNumber(a.budget, "budget", { min: -MONEY_MAX_ABS, max: MONEY_MAX_ABS }, event),
    day: optionalNumber(a.day, "day", { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }, event),
    date: V.optionalText(a.date, "date", AGENDA_DATE_MAX_LENGTH, event),
    filesToInsert: list(a._filesToInsert, "_filesToInsert", event).map((f) => validateAgendaFileBody(f, event)),
  };
}

export function validateBookingBody(value: unknown, event?: IRequestLogEvent): BookingBody {
  const b = record(value, "bookings", event);
  return {
    id: optionalId(b.id, "bookings.id", event),
    category: V.optionalText(b.category, "category", BOOKING_CATEGORY_MAX_LENGTH, event),
    item: text(b.item, "item", BOOKING_ITEM_MAX_LENGTH, event),
    remarks: V.optionalText(b.remarks, "remarks", BOOKING_REMARKS_MAX_LENGTH, event),
    link: V.optionalText(b.link, "link", BOOKING_LINK_MAX_LENGTH, event),
    payment: V.optionalText(b.payment, "payment", BOOKING_PAYMENT_MAX_LENGTH, event),
    startDate: V.optionalText(b.startDate, "startDate", BOOKING_DATE_MAX_LENGTH, event),
    endDate: V.optionalText(b.endDate, "endDate", BOOKING_DATE_MAX_LENGTH, event),
    nights: optionalNumber(b.nights, "nights", { min: 0, max: INT_MAX, integer: true }, event),
    price: optionalNumber(b.price, "price", { min: -MONEY_MAX_ABS, max: MONEY_MAX_ABS }, event),
    booked: flag(b.booked, "booked", event),
    freeCancellation: V.optionalText(
      b.freeCancellation,
      "freeCancellation",
      BOOKING_FREE_CANCELLATION_MAX_LENGTH,
      event,
    ),
    breakfast: flag(b.breakfast, "breakfast", event),
    deposit: V.optionalText(b.deposit, "deposit", BOOKING_DEPOSIT_MAX_LENGTH, event),
    paxBreakdown: isBlank(b.paxBreakdown) ? null : record(b.paxBreakdown, "paxBreakdown", event),
    sortOrder: optionalNumber(b.sortOrder, "sortOrder", { min: -INT_MAX, max: INT_MAX, integer: true }, event),
  };
}

export function validatePackingItemBody(value: unknown, event?: IRequestLogEvent): PackingItemBody {
  const p = record(value, "packingItems", event);
  return {
    id: optionalId(p.id, "packingItems.id", event),
    label: text(p.label, "label", PACKING_LABEL_MAX_LENGTH, event),
    category: V.optionalText(p.category, "category", PACKING_CATEGORY_MAX_LENGTH, event),
    packed: flag(p.packed, "packed", event),
    quantity: optionalNumber(p.quantity, "quantity", { min: 0, max: INT_MAX, integer: true }, event),
  };
}

export function validateNoteItemBody(value: unknown, event?: IRequestLogEvent): NoteItemBody {
  const n = record(value, "noteItems", event);
  return {
    id: optionalId(n.id, "noteItems.id", event),
    label: text(n.label, "label", NOTE_LABEL_MAX_LENGTH, event),
    category: V.optionalText(n.category, "category", NOTE_CATEGORY_MAX_LENGTH, event),
    url: V.optionalText(n.url, "url", NOTE_URL_MAX_LENGTH, event),
    done: flag(n.done, "done", event),
  };
}

/** Trip fields + child lists shared by create and update. Unknown fields (fndom sends its whole store) are ignored. */
function validateFields(body: Body, event?: IRequestLogEvent): ItineraryFieldsBody {
  const timestamp = (v: unknown, field: string) =>
    optionalNumber(v, field, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }, event);
  return {
    destination: V.optionalText(body.destination, "destination", DESTINATION_MAX_LENGTH, event),
    destinationRaw: stringList(body.destinationRaw, "destinationRaw", event),
    country: V.optionalText(body.country, "country", COUNTRY_MAX_LENGTH, event),
    numberOfPax: optionalNumber(body.numberOfPax, "numberOfPax", { min: 0, max: INT_MAX, integer: true }, event),
    itineraryDateRaw: stringList(body.itineraryDateRaw, "itineraryDateRaw", event),
    startDate: timestamp(body.startDate, "startDate"),
    endDate: timestamp(body.endDate, "endDate"),
    unknownDate: flag(body.unknownDate, "unknownDate", event),
    durationInDays: optionalNumber(
      body.durationInDays,
      "durationInDays",
      { min: 0, max: INT_MAX, integer: true },
      event,
    ),
    agendaItems: list(body.agendaItems, "agendaItems", event).map((a) => validateAgendaItemBody(a, event)),
    bookings: list(body.bookings, "bookings", event).map((b) => validateBookingBody(b, event)),
    packingItems: list(body.packingItems, "packingItems", event).map((p) => validatePackingItemBody(p, event)),
    noteItems: list(body.noteItems, "noteItems", event).map((n) => validateNoteItemBody(n, event)),
  };
}

/** `POST /itinerary` */
export function validateCreateBody(body: Body, event?: IRequestLogEvent): ItineraryCreateBody {
  return {
    ...validateFields(body, event),
    idempotencyKey: V.optionalText(body.idempotencyKey, "idempotencyKey", IDEMPOTENCY_KEY_MAX_LENGTH, event),
    sessionTitle: V.requiredText(body.sessionTitle, "sessionTitle", SESSION_TITLE_MAX_LENGTH, event),
    challenge: challengeCode(body.challenge, event),
    paxNames: stringList(body.paxNames, "paxNames", event),
  };
}

/** `POST /itinerary/:sessionId/update`. `_agendaIdsToUpdate` is ignored: every agenda item with an id is updated. */
export function validateUpdateBody(body: Body, event?: IRequestLogEvent): ItineraryUpdateBody {
  return {
    ...validateFields(body, event),
    sessionTitle: V.optionalText(body.sessionTitle, "sessionTitle", SESSION_TITLE_MAX_LENGTH, event),
    challenge: body.challenge === undefined ? undefined : challengeCode(body.challenge, event),
    paxNames: body.paxNames === undefined ? undefined : (stringList(body.paxNames, "paxNames", event) ?? []),
    agendaIdsToDelete: idList(body._agendaIdsToDelete, "_agendaIdsToDelete", event),
    bookingIdsToDelete: idList(body._bookingIdsToDelete, "_bookingIdsToDelete", event),
    packingIdsToDelete: idList(body._packingIdsToDelete, "_packingIdsToDelete", event),
    noteIdsToDelete: idList(body._noteIdsToDelete, "_noteIdsToDelete", event),
  };
}

/** `POST /itinerary/challenge` */
export function validateChallengeBody(body: Body, event?: IRequestLogEvent): ItineraryChallengeBody {
  const shortCode = V.requiredText(body.shortCode, "shortCode", SHORT_CODE_MAX_LENGTH, event);
  V.requiredString(body.challenge, "challenge", event);
  const challenge = body.challenge as string;
  if (!challenge || challenge.length > CHALLENGE_MAX_LENGTH) invalid("challenge", event);
  return { shortCode, challenge };
}
