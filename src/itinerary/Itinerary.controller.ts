import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import crypto from "crypto";
import { ITB_ITINERARY } from "../models/databases/tb_itinerary";
import { ITB_AGENDA_ITEM } from "../models/databases/tb_agenda_item";
import { ITB_TRAVEL_ITINERARY_VIEW } from "../models/databases/tb_travel_itinerary_view";
import { ITB_TRAVEL_ITINERARY_BOOKING } from "../models/databases/tb_travel_itinerary_booking";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { toMessage } from "../utils/errorUtils";
import { LoggingUtilities } from "../utils/LoggingUtilities";

const TABLE_ITINERARY_VIEW = "tb_travel_itinerary_view";

const TABLE_ITINERARY = "tb_travel_itinerary";
const TABLE_AGENDA_ITEM = "tb_travel_agenda_item";
const TABLE_AGENDA_FILE = "tb_travel_agenda_file";
const TABLE_BOOKING = "tb_travel_itinerary_booking";

function extractIp(req: Request): string {
  const raw = req.headers["x-real-ip"] || req.socket.remoteAddress || "Unknown";
  return Array.isArray(raw) ? raw[0] : raw;
}

async function recordView(db: KnexSqlUtilities, shortCode: string, req: Request): Promise<void> {
  try {
    await db.insert<ITB_TRAVEL_ITINERARY_VIEW>(TABLE_ITINERARY_VIEW, {
      short_code: shortCode,
      ip_address: extractIp(req),
      user_agent: (req.headers["user-agent"] || "Unknown").slice(0, 512),
      viewed_at: Date.now(),
    });
  } catch (err) {
    LoggingUtilities.service.warn("ItineraryController.recordView", `Failed to record view for ${shortCode}: ${toMessage(err)}`);
  }
}

async function getViewCount(db: KnexSqlUtilities, shortCode: string): Promise<number> {
  return db.count(TABLE_ITINERARY_VIEW, { short_code: shortCode });
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

function generateShortCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
}

function timeToMinutes(time: string | undefined): number | undefined {
  if (!time) return undefined;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return undefined;
  return h * 60 + m;
}

// Accepts an array or an already-JSON-encoded string; always returns a plain array (or null).
// Prevents double-encoding when items round-trip through the API with city_raw as a string.
function normaliseCityRaw(value: string[] | string | undefined | null): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value.length ? value : null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function minutesToTime(minutes: number | undefined | null): string | undefined {
  if (minutes == null) return undefined;
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default function createItineraryController(db: KnexSqlUtilities) {
  const router = Router();

  // GET / — list itineraries owned by the authenticated user
  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const trips = await db.find<ITB_ITINERARY>(
        TABLE_ITINERARY,
        { record_status: "A", created_by: req.user!.username },
        {
          orderBy: "created_dt",
          orderDirection: "desc",
          columns: ["id", "session_id", "short_code", "session_title", "destination", "start_date", "end_date", "number_of_pax", "created_dt"],
        }
      );

      const myTrips = trips.map((t) => ({
        id: t.id,
        sessionId: t.session_id,
        sessionTitle: t.session_title,
        destination: t.destination,
        startDate: t.start_date,
        endDate: t.end_date,
        numberOfPax: t.number_of_pax,
        shortCode: t.short_code,
      }));

      return response.ok({ myTrips, sharedTrips: [] });
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  // POST /delete/:sessionId — soft-delete a trip
  router.post("/delete/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { sessionId } = req.params;

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      if (itinerary.created_by !== req.user!.username) return response.result(403, "Forbidden", "You do not have permission to delete this itinerary");

      await db.update<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId }, { record_status: "D" });

      return response.ok({ deleted: true });
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  // POST /challenge — verify access code and return full itinerary
  router.post("/challenge", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { shortCode, challenge } = req.body;
      if (!shortCode || !challenge) return response.badRequest("shortCode and challenge are required");

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { short_code: shortCode, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      if (itinerary.challenge !== challenge) return response.badRequest("Incorrect access code");

      const agendaItems = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { itinerary_id: itinerary.id!, record_status: "A" }, { orderBy: "id", orderDirection: "asc" }) as ITB_AGENDA_ITEM[];
      const itemsWithFiles = await attachFilesToAgendaItems(db, agendaItems);

      // Record view and fetch count
      recordView(db, itinerary.short_code, req);
      const [viewCount, bookings] = await Promise.all([
        getViewCount(db, itinerary.short_code),
        fetchBookingsForItinerary(db, itinerary.id!),
      ]);

      return response.ok(buildItineraryResponse(itinerary, itemsWithFiles, viewCount, bookings));
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  // POST /add-collaborator — stub
  router.post("/add-collaborator", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    return response.ok({ added: false, message: "Not yet implemented" });
  });

  // POST / — create itinerary
  router.post("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const {
        idempotencyKey,
        sessionTitle,
        destination,
        destinationRaw,
        country,
        numberOfPax,
        itineraryDateRaw,
        startDate,
        endDate,
        unknownDate,
        durationInDays,
        challenge,
        agendaItems = [],
        paxNames = [],
        bookings = [],
      } = req.body;

      if (!sessionTitle) return response.badRequest("sessionTitle is required");

      // Idempotency check
      if (idempotencyKey) {
        const existing = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { idempotency_key: idempotencyKey }) as ITB_ITINERARY | undefined;
        if (existing) {
          const existingAgenda = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, {
            itinerary_id: existing.id!,
            record_status: "A",
          }) as ITB_AGENDA_ITEM[];
          const agendaToFileMap = existingAgenda.map((a) => ({ agendaId: a.id, fileUuids: [] }));
          return response.ok({ shortCode: existing.short_code, sessionId: existing.session_id, agendaToFileMap });
        }
      }

      const sessionId = generateSessionId();
      const shortCode = generateShortCode();
      const now = Date.now();

      const agendaToFileMap = await db.transaction(async (trx) => {
        const [itineraryId] = await trx(TABLE_ITINERARY).insert({
          session_id: sessionId,
          short_code: shortCode,
          idempotency_key: idempotencyKey || undefined,
          session_title: sessionTitle,
          destination: destination || undefined,
          destination_raw: destinationRaw?.length ? JSON.stringify(destinationRaw) : undefined,
          country: country || undefined,
          number_of_pax: numberOfPax || 1,
          itinerary_date_raw: itineraryDateRaw?.length ? JSON.stringify(itineraryDateRaw) : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          unknown_date: unknownDate ? 1 : 0,
          duration_in_days: durationInDays || 1,
          challenge: challenge || undefined,
          pax_names: paxNames?.length ? JSON.stringify(paxNames) : undefined,
          created_dt: now,
          created_by: req.user!.username,
          record_status: "A",
        });

        const map: { agendaId: number; fileUuids: string[] }[] = [];

        for (const item of agendaItems) {
          const [agendaItemId] = await trx(TABLE_AGENDA_ITEM).insert({
            itinerary_id: itineraryId,
            category: item.category || undefined,
            title: item.title,
            desc: item.desc || undefined,
            city: item.city || undefined,
            city_raw: item.cityRaw?.length ? JSON.stringify(item.cityRaw) : undefined,
            start_time: timeToMinutes(item.startTime),
            end_time: timeToMinutes(item.endTime),
            duration_in_hours: item.durationInHours || undefined,
            unknown_time: item.unknownTime ? 1 : 0,
            budget: item.budget || undefined,
            day: item.day || undefined,
            date: item.date || undefined,
            created_dt: now,
            record_status: "A",
          });

          map.push({
            agendaId: agendaItemId,
            fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [],
          });
        }

        // Insert bookings
        for (const b of bookings) {
          await trx(TABLE_BOOKING).insert({
            itinerary_id: itineraryId,
            category: b.category || undefined,
            item: b.item,
            location: b.location || undefined,
            link: b.link || undefined,
            payment: b.payment || undefined,
            start_date: b.startDate || undefined,
            end_date: b.endDate || undefined,
            nights: b.nights != null ? b.nights : undefined,
            price: b.price != null ? b.price : undefined,
            booked: b.booked ? 1 : 0,
            free_cancellation: b.freeCancellation || undefined,
            breakfast: b.breakfast ? 1 : 0,
            deposit: b.deposit || undefined,
            pax_breakdown: b.paxBreakdown ? JSON.stringify(b.paxBreakdown) : undefined,
            sort_order: b.sortOrder ?? 0,
            created_dt: now,
            record_status: "A",
          });
        }

        return map;
      });

      return response.ok({ shortCode, sessionId, agendaToFileMap });
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  // GET /v/:shortCode — public viewer (includes blobs)
  router.get("/v/:shortCode", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { shortCode } = req.params;

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { short_code: shortCode, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      if (itinerary.challenge) {
        return response.ok({ hasChallenge: true });
      }

      const agendaItems = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { itinerary_id: itinerary.id!, record_status: "A" }, { orderBy: "id", orderDirection: "asc" }) as ITB_AGENDA_ITEM[];
      const itemsWithFiles = await attachFilesToAgendaItems(db, agendaItems);

      // Record view and fetch count (fire-and-forget the insert, await the count)
      recordView(db, shortCode, req);
      const [viewCount, bookings] = await Promise.all([
        getViewCount(db, shortCode),
        fetchBookingsForItinerary(db, itinerary.id!),
      ]);

      return response.ok(buildItineraryResponse(itinerary, itemsWithFiles, viewCount, bookings));
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  // GET /:sessionId — planner load (file metadata only, no blobs)
  router.get("/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { sessionId } = req.params;

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      const agendaItems = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { itinerary_id: itinerary.id!, record_status: "A" }, { orderBy: "id", orderDirection: "asc" }) as ITB_AGENDA_ITEM[];

      const itemsWithFiles = await attachFilesToAgendaItems(db, agendaItems, [
        "id", "uuid", "agenda_item_id", "name", "mime_type", "size_in_bytes", "created_dt",
      ]);

      const bookings = await fetchBookingsForItinerary(db, itinerary.id!);
      return response.ok(buildItineraryResponse(itinerary, itemsWithFiles, undefined, bookings));
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  // POST /edit/:sessionId — update itinerary
  router.post("/edit/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { sessionId } = req.params;
      const {
        sessionTitle,
        destination,
        destinationRaw,
        country,
        numberOfPax,
        itineraryDateRaw,
        startDate,
        endDate,
        unknownDate,
        durationInDays,
        challenge,
        agendaItems = [],
        _agendaIdsToDelete = [],
        _agendaIdsToUpdate = [],
        paxNames,
        bookings = [],
        _bookingIdsToDelete = [],
      } = req.body;

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      if (itinerary.created_by !== req.user!.username) return response.result(403, "Forbidden", "You do not have permission to edit this itinerary");

      const now = Date.now();

      const agendaToFileMap = await db.transaction(async (trx) => {
        await trx(TABLE_ITINERARY).where({ session_id: sessionId }).update({
          session_title: sessionTitle || itinerary.session_title,
          destination: destination || undefined,
          destination_raw: destinationRaw?.length ? JSON.stringify(destinationRaw) : undefined,
          country: country || undefined,
          number_of_pax: numberOfPax || 1,
          itinerary_date_raw: itineraryDateRaw?.length ? JSON.stringify(itineraryDateRaw) : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          unknown_date: unknownDate ? 1 : 0,
          duration_in_days: durationInDays || 1,
          challenge: challenge !== undefined ? (challenge || null) : itinerary.challenge,
          pax_names: paxNames !== undefined ? (paxNames?.length ? JSON.stringify(paxNames) : null) : undefined,
        });

        // Soft-delete removed agenda items
        for (const agendaId of _agendaIdsToDelete) {
          await trx(TABLE_AGENDA_ITEM).where({ id: Number(agendaId) }).update({ record_status: "D" });
        }

        const map: { agendaId: number; fileUuids: string[] }[] = [];

        for (const item of agendaItems) {
          if (item.id) {
            // Update existing — accept both camelCase (frontend store) and snake_case (round-tripped from DB)
            const cityRaw = normaliseCityRaw(item.cityRaw ?? item.city_raw);
            const startTime = item.startTime ?? item.start_time;
            const endTime = item.endTime ?? item.end_time;
            const unknownTime = item.unknownTime ?? item.unknown_time;
            const durationInHours = item.durationInHours ?? item.duration_in_hours;
            await trx(TABLE_AGENDA_ITEM).where({ id: Number(item.id) }).update({
              category: item.category || undefined,
              title: item.title,
              desc: item.desc || undefined,
              city: item.city || undefined,
              city_raw: cityRaw?.length ? JSON.stringify(cityRaw) : undefined,
              start_time: timeToMinutes(startTime),
              end_time: timeToMinutes(endTime),
              duration_in_hours: durationInHours || undefined,
              unknown_time: unknownTime ? 1 : 0,
              budget: item.budget || undefined,
              day: item.day || undefined,
              date: item.date || undefined,
            });
            map.push({
              agendaId: Number(item.id),
              fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [],
            });
          } else {
            // Insert new
            const [newItemId] = await trx(TABLE_AGENDA_ITEM).insert({
              itinerary_id: itinerary.id!,
              category: item.category || undefined,
              title: item.title,
              desc: item.desc || undefined,
              city: item.city || undefined,
              city_raw: item.cityRaw?.length ? JSON.stringify(item.cityRaw) : undefined,
              start_time: timeToMinutes(item.startTime),
              end_time: timeToMinutes(item.endTime),
              duration_in_hours: item.durationInHours || undefined,
              unknown_time: item.unknownTime ? 1 : 0,
              budget: item.budget || undefined,
              day: item.day || undefined,
              date: item.date || undefined,
              created_dt: now,
              record_status: "A",
            });
            map.push({
              agendaId: newItemId,
              fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [],
            });
          }
        }

        // Soft-delete removed bookings
        for (const bookingId of _bookingIdsToDelete) {
          await trx(TABLE_BOOKING).where({ id: Number(bookingId) }).update({ record_status: "D" });
        }

        // Upsert bookings
        for (const b of bookings) {
          if (b.id) {
            await trx(TABLE_BOOKING).where({ id: Number(b.id) }).update({
              category: b.category || undefined,
              item: b.item,
              location: b.location || undefined,
              link: b.link || undefined,
              payment: b.payment || undefined,
              start_date: b.startDate || undefined,
              end_date: b.endDate || undefined,
              nights: b.nights != null ? b.nights : undefined,
              price: b.price != null ? b.price : undefined,
              booked: b.booked ? 1 : 0,
              free_cancellation: b.freeCancellation || undefined,
              breakfast: b.breakfast ? 1 : 0,
              deposit: b.deposit || undefined,
              pax_breakdown: b.paxBreakdown ? JSON.stringify(b.paxBreakdown) : undefined,
              sort_order: b.sortOrder ?? 0,
            });
          } else {
            await trx(TABLE_BOOKING).insert({
              itinerary_id: itinerary.id!,
              category: b.category || undefined,
              item: b.item,
              location: b.location || undefined,
              link: b.link || undefined,
              payment: b.payment || undefined,
              start_date: b.startDate || undefined,
              end_date: b.endDate || undefined,
              nights: b.nights != null ? b.nights : undefined,
              price: b.price != null ? b.price : undefined,
              booked: b.booked ? 1 : 0,
              free_cancellation: b.freeCancellation || undefined,
              breakfast: b.breakfast ? 1 : 0,
              deposit: b.deposit || undefined,
              pax_breakdown: b.paxBreakdown ? JSON.stringify(b.paxBreakdown) : undefined,
              sort_order: b.sortOrder ?? 0,
              created_dt: now,
              record_status: "A",
            });
          }
        }

        return map;
      });

      return response.ok({ shortCode: itinerary.short_code, sessionId, agendaToFileMap });
    } catch (error) {
      return response.ko(toMessage(error));
    }
  });

  return router;
}

/**
 * Fetches all files for the given agenda items in a single query,
 * then groups them by agenda_item_id — eliminating the N+1 pattern.
 */
async function attachFilesToAgendaItems(
  db: KnexSqlUtilities,
  agendaItems: ITB_AGENDA_ITEM[],
  columns?: readonly string[]
): Promise<(ITB_AGENDA_ITEM & { files: any[] })[]> {
  const ids = agendaItems.map((i) => i.id!).filter(Boolean);

  if (!ids.length) return agendaItems.map((item) => ({ ...item, files: [] }));

  const files = await db.find(
    TABLE_AGENDA_FILE,
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

async function fetchBookingsForItinerary(db: KnexSqlUtilities, itineraryId: number): Promise<any[]> {
  const rows = await db.find<ITB_TRAVEL_ITINERARY_BOOKING>(
    TABLE_BOOKING,
    { itinerary_id: itineraryId, record_status: "A" },
    { orderBy: "sort_order", orderDirection: "asc" }
  ) as ITB_TRAVEL_ITINERARY_BOOKING[];

  return rows.map((b) => ({
    id: b.id,
    itineraryId: b.itinerary_id,
    category: b.category,
    item: b.item,
    location: b.location,
    link: b.link,
    payment: b.payment,
    startDate: b.start_date,
    endDate: b.end_date,
    nights: b.nights,
    price: b.price != null ? Number(b.price) : undefined,
    booked: !!b.booked,
    freeCancellation: b.free_cancellation,
    breakfast: !!b.breakfast,
    deposit: b.deposit,
    paxBreakdown: b.pax_breakdown ? JSON.parse(b.pax_breakdown) : undefined,
    sortOrder: b.sort_order,
  }));
}

function buildItineraryResponse(itinerary: ITB_ITINERARY, agendaItems: any[], viewCount?: number, bookings: any[] = []) {
  return {
    id: itinerary.id,
    sessionId: itinerary.session_id,
    sessionTitle: itinerary.session_title,
    shortCode: itinerary.short_code,
    destination: itinerary.destination,
    destinationRaw: itinerary.destination_raw,
    country: itinerary.country,
    numberOfPax: itinerary.number_of_pax,
    itineraryDateRaw: itinerary.itinerary_date_raw,
    startDate: itinerary.start_date,
    endDate: itinerary.end_date,
    unknownDate: !!itinerary.unknown_date,
    durationInDays: itinerary.duration_in_days,
    challenge: itinerary.challenge,
    paxNames: itinerary.pax_names ? JSON.parse(itinerary.pax_names) : [],
    ...(viewCount !== undefined ? { viewCount } : {}),
    bookings,
    agendaItems: agendaItems.map(({ record_status, created_dt, ...item }: any) => ({
      ...item,
      start_time: minutesToTime(item.start_time),
      end_time: minutesToTime(item.end_time),
      files: item.files?.map(({ record_status: _rs, created_dt: _cd, agenda_item_id: _aid, ...file }: any) => file) ?? [],
    })),
  };
}
