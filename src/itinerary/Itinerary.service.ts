import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_ITINERARY } from "../models/databases/tb_itinerary";
import { ITB_AGENDA_ITEM } from "../models/databases/tb_agenda_item";
import { ITB_TRAVEL_ITINERARY_VIEW } from "../models/databases/tb_travel_itinerary_view";
import { ITB_TRAVEL_ITINERARY_BOOKING } from "../models/databases/tb_travel_itinerary_booking";
import { Exceptions } from "../exceptions/AppExceptions";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { toMessage } from "../utils/errorUtils";

const TB_TRAVEL_ITINERARY         = "tb_travel_itinerary";
const TB_TRAVEL_AGENDA_ITEM       = "tb_travel_agenda_item";
const TB_TRAVEL_AGENDA_FILE       = "tb_travel_agenda_file";
const TB_TRAVEL_ITINERARY_BOOKING = "tb_travel_itinerary_booking";
const TB_TRAVEL_ITINERARY_VIEW    = "tb_travel_itinerary_view";

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function generateSessionId(): string { return crypto.randomUUID(); }
export function generateShortCode(): string  { return crypto.randomBytes(4).toString("hex"); }

export function timeToMinutes(time: string | undefined): number | undefined {
  if (!time) return undefined;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return undefined;
  return h * 60 + m;
}

export function minutesToTime(minutes: number | undefined | null): string | undefined {
  if (minutes == null) return undefined;
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function normaliseCityRaw(value: string[] | string | undefined | null): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value.length ? value : null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch { return null; }
}

export function buildItineraryResponse(
  itinerary: ITB_ITINERARY,
  agendaItems: any[],
  viewCount?: number,
  bookings: any[] = []
) {
  return {
    id:               itinerary.id,
    sessionId:        itinerary.session_id,
    sessionTitle:     itinerary.session_title,
    shortCode:        itinerary.short_code,
    destination:      itinerary.destination,
    destinationRaw:   itinerary.destination_raw,
    country:          itinerary.country,
    numberOfPax:      itinerary.number_of_pax,
    itineraryDateRaw: itinerary.itinerary_date_raw,
    startDate:        itinerary.start_date,
    endDate:          itinerary.end_date,
    unknownDate:      !!itinerary.unknown_date,
    durationInDays:   itinerary.duration_in_days,
    challenge:        itinerary.challenge,
    paxNames:         itinerary.pax_names ? JSON.parse(itinerary.pax_names) : [],
    ...(viewCount !== undefined ? { viewCount } : {}),
    bookings,
    agendaItems: agendaItems.map(({ record_status, created_dt, coordinates_lat, coordinates_lng, ...item }: any) => ({
      ...item,
      start_time:  minutesToTime(item.start_time),
      end_time:    minutesToTime(item.end_time),
      coordinates: coordinates_lat != null && coordinates_lng != null
        ? { lat: Number(coordinates_lat), lng: Number(coordinates_lng) }
        : undefined,
      files: item.files?.map(({ record_status: _rs, created_dt: _cd, agenda_item_id: _aid, ...file }: any) => file) ?? [],
    })),
  };
}

export class ItineraryService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async attachFilesToAgendaItems(
    agendaItems: ITB_AGENDA_ITEM[],
    columns?: readonly string[]
  ): Promise<(ITB_AGENDA_ITEM & { files: any[] })[]> {
    const ids = agendaItems.map((i) => i.id!).filter(Boolean);
    if (!ids.length) return agendaItems.map((item) => ({ ...item, files: [] }));

    const files = await this.db.find(
      TB_TRAVEL_AGENDA_FILE,
      { record_status: "A" },
      {
        extraWhere: (qb) => qb.whereIn("agenda_item_id", ids),
        ...(columns ? { columns } : {}),
      }
    );

    const filesByItemId = files.reduce<Record<number, any[]>>((acc, file: any) => {
      const key = file.agenda_item_id as number;
      if (!acc[key]) acc[key] = [];
      acc[key].push(file);
      return acc;
    }, {});

    return agendaItems.map((item) => ({ ...item, files: filesByItemId[item.id!] ?? [] }));
  }

  async fetchBookingsForItinerary(itineraryId: number): Promise<any[]> {
    const rows = await this.db.find<ITB_TRAVEL_ITINERARY_BOOKING>(
      TB_TRAVEL_ITINERARY_BOOKING,
      { itinerary_id: itineraryId, record_status: "A" },
      { orderBy: "sort_order", orderDirection: "asc" }
    ) as ITB_TRAVEL_ITINERARY_BOOKING[];

    return rows.map((b) => ({
      id:               b.id,
      itineraryId:      b.itinerary_id,
      category:         b.category,
      item:             b.item,
      remarks:          b.location,
      link:             b.link,
      payment:          b.payment,
      startDate:        b.start_date,
      endDate:          b.end_date,
      nights:           b.nights,
      price:            b.price != null ? Number(b.price) : undefined,
      booked:           !!b.booked,
      freeCancellation: b.free_cancellation,
      breakfast:        !!b.breakfast,
      deposit:          b.deposit,
      paxBreakdown:     b.pax_breakdown ? JSON.parse(b.pax_breakdown) : undefined,
      sortOrder:        b.sort_order,
    }));
  }

  async recordView(shortCode: string, ipAddress: string, userAgent: string): Promise<void> {
    try {
      await this.db.insert<ITB_TRAVEL_ITINERARY_VIEW>(TB_TRAVEL_ITINERARY_VIEW, {
        short_code: shortCode,
        ip_address: ipAddress,
        user_agent: userAgent.slice(0, 512),
        viewed_at:  Date.now(),
      });
    } catch (err) {
      LoggingUtilities.service.warn("ItineraryService.recordView", `Failed to record view for ${shortCode}: ${toMessage(err)}`);
    }
  }

  async getViewCount(shortCode: string): Promise<number> {
    return this.db.count(TB_TRAVEL_ITINERARY_VIEW, { short_code: shortCode });
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  async listTrips(username: string): Promise<any[]> {
    const trips = await this.db.find<ITB_ITINERARY>(
      TB_TRAVEL_ITINERARY,
      { record_status: "A", created_by: username },
      {
        orderBy: "created_dt",
        orderDirection: "desc",
        columns: ["id", "session_id", "short_code", "session_title", "destination", "start_date", "end_date", "number_of_pax", "created_dt"],
      }
    );
    return trips.map((t) => ({
      id:            t.id,
      sessionId:     t.session_id,
      sessionTitle:  t.session_title,
      destination:   t.destination,
      startDate:     t.start_date,
      endDate:       t.end_date,
      numberOfPax:   t.number_of_pax,
      shortCode:     t.short_code,
    }));
  }

  async deleteTrip(username: string, sessionId: string): Promise<void> {
    const itinerary = await this.db.findOne<ITB_ITINERARY>(
      TB_TRAVEL_ITINERARY,
      { session_id: sessionId, record_status: "A" }
    ) as ITB_ITINERARY | undefined;
    if (!itinerary) throw new Exceptions.NotFound();
    if (itinerary.created_by !== username) throw new Exceptions.ForbiddenAccess();
    await this.db.update<ITB_ITINERARY>(TB_TRAVEL_ITINERARY, { session_id: sessionId }, { record_status: "D" });
  }

  async getBySessionId(username: string, sessionId: string): Promise<ReturnType<typeof buildItineraryResponse>> {
    const itinerary = await this.db.findOne<ITB_ITINERARY>(
      TB_TRAVEL_ITINERARY,
      { session_id: sessionId, record_status: "A" }
    ) as ITB_ITINERARY | undefined;
    if (!itinerary) throw new Exceptions.NotFound();
    if (itinerary.created_by !== username) throw new Exceptions.ForbiddenAccess();

    const agendaItems = await this.db.find<ITB_AGENDA_ITEM>(
      TB_TRAVEL_AGENDA_ITEM,
      { itinerary_id: itinerary.id!, record_status: "A" },
      { orderBy: "id", orderDirection: "asc" }
    ) as ITB_AGENDA_ITEM[];

    const itemsWithFiles = await this.attachFilesToAgendaItems(agendaItems, [
      "id", "uuid", "agenda_item_id", "name", "mime_type", "size_in_bytes", "created_dt",
    ]);
    const bookings = await this.fetchBookingsForItinerary(itinerary.id!);
    return buildItineraryResponse(itinerary, itemsWithFiles, undefined, bookings);
  }

  async getByShortCode(shortCode: string): Promise<{ hasChallenge: boolean } | ReturnType<typeof buildItineraryResponse>> {
    const itinerary = await this.db.findOne<ITB_ITINERARY>(
      TB_TRAVEL_ITINERARY,
      { short_code: shortCode, record_status: "A" }
    ) as ITB_ITINERARY | undefined;
    if (!itinerary) throw new Exceptions.NotFound();

    if (itinerary.challenge) return { hasChallenge: true };

    const agendaItems = await this.db.find<ITB_AGENDA_ITEM>(
      TB_TRAVEL_AGENDA_ITEM,
      { itinerary_id: itinerary.id!, record_status: "A" },
      { orderBy: "id", orderDirection: "asc" }
    ) as ITB_AGENDA_ITEM[];

    const itemsWithFiles = await this.attachFilesToAgendaItems(agendaItems, [
      "id", "uuid", "agenda_item_id", "name", "mime_type", "size_in_bytes", "created_dt",
    ]);
    const [viewCount, bookings] = await Promise.all([
      this.getViewCount(shortCode),
      this.fetchBookingsForItinerary(itinerary.id!),
    ]);
    return buildItineraryResponse(itinerary, itemsWithFiles, viewCount, bookings);
  }

  async verifyChallenge(shortCode: string, challenge: string): Promise<ReturnType<typeof buildItineraryResponse>> {
    const itinerary = await this.db.findOne<ITB_ITINERARY>(
      TB_TRAVEL_ITINERARY,
      { short_code: shortCode, record_status: "A" }
    ) as ITB_ITINERARY | undefined;
    if (!itinerary) throw new Exceptions.NotFound();
    if (itinerary.challenge !== challenge) throw new Exceptions.InvalidRequest("challenge");

    const agendaItems = await this.db.find<ITB_AGENDA_ITEM>(
      TB_TRAVEL_AGENDA_ITEM,
      { itinerary_id: itinerary.id!, record_status: "A" },
      { orderBy: "id", orderDirection: "asc" }
    ) as ITB_AGENDA_ITEM[];

    const itemsWithFiles = await this.attachFilesToAgendaItems(agendaItems, [
      "id", "uuid", "agenda_item_id", "name", "mime_type", "size_in_bytes", "created_dt",
    ]);
    const [viewCount, bookings] = await Promise.all([
      this.getViewCount(shortCode),
      this.fetchBookingsForItinerary(itinerary.id!),
    ]);
    return buildItineraryResponse(itinerary, itemsWithFiles, viewCount, bookings);
  }

  async create(username: string, body: any): Promise<{ shortCode: string; sessionId: string; agendaToFileMap: any[] }> {
    const {
      idempotencyKey, sessionTitle, destination, destinationRaw, country,
      numberOfPax, itineraryDateRaw, startDate, endDate, unknownDate,
      durationInDays, challenge, agendaItems, paxNames, bookings,
    } = body;

    if (idempotencyKey) {
      const existing = await this.db.findOne<ITB_ITINERARY>(
        TB_TRAVEL_ITINERARY,
        { idempotency_key: idempotencyKey }
      ) as ITB_ITINERARY | undefined;
      if (existing) {
        const existingAgenda = await this.db.find<ITB_AGENDA_ITEM>(
          TB_TRAVEL_AGENDA_ITEM,
          { itinerary_id: existing.id!, record_status: "A" }
        ) as ITB_AGENDA_ITEM[];
        return {
          shortCode:       existing.short_code,
          sessionId:       existing.session_id,
          agendaToFileMap: existingAgenda.map((a) => ({ agendaId: a.id, fileUuids: [] })),
        };
      }
    }

    const sessionId = generateSessionId();
    const shortCode = generateShortCode();
    const now = Date.now();

    const agendaToFileMap = await this.db.transaction(async (trx) => {
      const [itineraryId] = await trx(TB_TRAVEL_ITINERARY).insert({
        session_id:           sessionId,
        short_code:           shortCode,
        idempotency_key:      idempotencyKey || undefined,
        session_title:        sessionTitle,
        destination:          destination || undefined,
        destination_raw:      destinationRaw?.length ? JSON.stringify(destinationRaw) : undefined,
        country:              country || undefined,
        number_of_pax:        numberOfPax || 1,
        itinerary_date_raw:   itineraryDateRaw?.length ? JSON.stringify(itineraryDateRaw) : undefined,
        start_date:           startDate || undefined,
        end_date:             endDate || undefined,
        unknown_date:         unknownDate ? 1 : 0,
        duration_in_days:     durationInDays || 1,
        challenge:            challenge || undefined,
        pax_names:            paxNames?.length ? JSON.stringify(paxNames) : undefined,
        created_dt:           now,
        created_by:           username,
        record_status:        "A",
      });

      const map: { agendaId: number; fileUuids: string[] }[] = [];

      for (const item of agendaItems) {
        const [agendaItemId] = await trx(TB_TRAVEL_AGENDA_ITEM).insert({
          itinerary_id:   itineraryId,
          category:       item.category || undefined,
          title:          item.title,
          desc:           item.desc || undefined,
          city:           item.city || undefined,
          city_raw:       item.cityRaw?.length ? JSON.stringify(item.cityRaw) : undefined,
          coordinates_lat: item.coordinates?.lat ?? undefined,
          coordinates_lng: item.coordinates?.lng ?? undefined,
          start_time:     timeToMinutes(item.startTime),
          end_time:       timeToMinutes(item.endTime),
          duration_in_hours: item.durationInHours || undefined,
          unknown_time:   item.unknownTime ? 1 : 0,
          budget:         item.budget || undefined,
          day:            item.day || undefined,
          date:           item.date || undefined,
          created_dt:     now,
          record_status:  "A",
        });
        map.push({ agendaId: agendaItemId, fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [] });
      }

      for (const b of bookings) {
        await trx(TB_TRAVEL_ITINERARY_BOOKING).insert(this._bookingInsertRow(itineraryId, b, now));
      }

      return map;
    });

    return { shortCode, sessionId, agendaToFileMap };
  }

  async edit(
    username: string,
    sessionId: string,
    body: any
  ): Promise<{ shortCode: string; sessionId: string; agendaToFileMap: any[] }> {
    const {
      sessionTitle, destination, destinationRaw, country, numberOfPax,
      itineraryDateRaw, startDate, endDate, unknownDate, durationInDays,
      challenge, agendaItems, _agendaIdsToDelete, paxNames, bookings, _bookingIdsToDelete,
    } = body;

    const itinerary = await this.db.findOne<ITB_ITINERARY>(
      TB_TRAVEL_ITINERARY,
      { session_id: sessionId, record_status: "A" }
    ) as ITB_ITINERARY | undefined;
    if (!itinerary) throw new Exceptions.NotFound();
    if (itinerary.created_by !== username) throw new Exceptions.ForbiddenAccess();

    const now = Date.now();

    const agendaToFileMap = await this.db.transaction(async (trx) => {
      await trx(TB_TRAVEL_ITINERARY).where({ session_id: sessionId }).update({
        session_title:      sessionTitle || itinerary.session_title,
        destination:        destination || undefined,
        destination_raw:    destinationRaw?.length ? JSON.stringify(destinationRaw) : undefined,
        country:            country || undefined,
        number_of_pax:      numberOfPax || 1,
        itinerary_date_raw: itineraryDateRaw?.length ? JSON.stringify(itineraryDateRaw) : undefined,
        start_date:         startDate || undefined,
        end_date:           endDate || undefined,
        unknown_date:       unknownDate ? 1 : 0,
        duration_in_days:   durationInDays || 1,
        challenge:          challenge !== undefined ? (challenge || null) : itinerary.challenge,
        pax_names:          paxNames !== undefined ? (paxNames?.length ? JSON.stringify(paxNames) : null) : undefined,
      });

      for (const agendaId of _agendaIdsToDelete) {
        await trx(TB_TRAVEL_AGENDA_ITEM).where({ id: Number(agendaId) }).update({ record_status: "D" });
      }

      const map: { agendaId: number; fileUuids: string[] }[] = [];

      for (const item of agendaItems) {
        if (item.id) {
          const cityRaw    = normaliseCityRaw(item.cityRaw ?? item.city_raw);
          const startTime  = item.startTime ?? item.start_time;
          const endTime    = item.endTime ?? item.end_time;
          const unknownTime      = item.unknownTime ?? item.unknown_time;
          const durationInHours  = item.durationInHours ?? item.duration_in_hours;
          await trx(TB_TRAVEL_AGENDA_ITEM).where({ id: Number(item.id) }).update({
            category:         item.category || undefined,
            title:            item.title,
            desc:             item.desc || undefined,
            city:             item.city || undefined,
            city_raw:         cityRaw?.length ? JSON.stringify(cityRaw) : undefined,
            coordinates_lat:  item.coordinates?.lat ?? undefined,
            coordinates_lng:  item.coordinates?.lng ?? undefined,
            start_time:       timeToMinutes(startTime),
            end_time:         timeToMinutes(endTime),
            duration_in_hours: durationInHours || undefined,
            unknown_time:     unknownTime ? 1 : 0,
            budget:           item.budget || undefined,
            day:              item.day || undefined,
            date:             item.date || undefined,
          });
          map.push({ agendaId: Number(item.id), fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [] });
        } else {
          const [newItemId] = await trx(TB_TRAVEL_AGENDA_ITEM).insert({
            itinerary_id:    itinerary.id!,
            category:        item.category || undefined,
            title:           item.title,
            desc:            item.desc || undefined,
            city:            item.city || undefined,
            city_raw:        item.cityRaw?.length ? JSON.stringify(item.cityRaw) : undefined,
            coordinates_lat: item.coordinates?.lat ?? undefined,
            coordinates_lng: item.coordinates?.lng ?? undefined,
            start_time:      timeToMinutes(item.startTime),
            end_time:        timeToMinutes(item.endTime),
            duration_in_hours: item.durationInHours || undefined,
            unknown_time:    item.unknownTime ? 1 : 0,
            budget:          item.budget || undefined,
            day:             item.day || undefined,
            date:            item.date || undefined,
            created_dt:      now,
            record_status:   "A",
          });
          map.push({ agendaId: newItemId, fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [] });
        }
      }

      for (const bookingId of _bookingIdsToDelete) {
        await trx(TB_TRAVEL_ITINERARY_BOOKING).where({ id: Number(bookingId) }).update({ record_status: "D" });
      }

      for (const b of bookings) {
        if (b.id) {
          await trx(TB_TRAVEL_ITINERARY_BOOKING).where({ id: Number(b.id) }).update(this._bookingUpdateRow(b));
        } else {
          await trx(TB_TRAVEL_ITINERARY_BOOKING).insert(this._bookingInsertRow(itinerary.id!, b, now));
        }
      }

      return map;
    });

    return { shortCode: itinerary.short_code, sessionId, agendaToFileMap };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _bookingInsertRow(itineraryId: number, b: any, now: number) {
    return {
      itinerary_id:      itineraryId,
      ...this._bookingUpdateRow(b),
      created_dt:        now,
      record_status:     "A",
    };
  }

  private _bookingUpdateRow(b: any) {
    return {
      category:         b.category || undefined,
      item:             b.item,
      location:         b.remarks || undefined,
      link:             b.link || undefined,
      payment:          b.payment || undefined,
      start_date:       b.startDate || undefined,
      end_date:         b.endDate || undefined,
      nights:           b.nights != null ? b.nights : undefined,
      price:            b.price != null ? b.price : undefined,
      booked:           b.booked ? 1 : 0,
      free_cancellation: b.freeCancellation || undefined,
      breakfast:        b.breakfast ? 1 : 0,
      deposit:          b.deposit || undefined,
      pax_breakdown:    b.paxBreakdown ? JSON.stringify(b.paxBreakdown) : undefined,
      sort_order:       b.sortOrder ?? 0,
    };
  }
}
