import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import crypto from "crypto";
import { ITB_ITINERARY } from "../models/databases/tb_itinerary";
import { ITB_AGENDA_ITEM } from "../models/databases/tb_agenda_item";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";

const TABLE_ITINERARY = "tb_travel_itinerary";
const TABLE_AGENDA_ITEM = "tb_travel_agenda_item";
const TABLE_AGENDA_FILE = "tb_travel_agenda_file";

function generateSessionId(): string {
  return crypto.randomUUID();
}

function generateShortCode(): string {
  return crypto.randomBytes(4).toString("hex"); // 8-char hex
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
    } catch (error: any) {
      return response.ko(error.message);
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
    } catch (error: any) {
      return response.ko(error.message);
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

      const agendaItems = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { itinerary_id: itinerary.id!, record_status: "A" }, { orderBy: "day", orderDirection: "asc" }) as ITB_AGENDA_ITEM[];

      const itemsWithFiles = await Promise.all(
        agendaItems.map(async (item) => {
          const files = await db.find(TABLE_AGENDA_FILE, { agenda_item_id: item.id!, record_status: "A" });
          return { ...item, files };
        })
      );

      return response.ok(buildItineraryResponse(itinerary, itemsWithFiles));
    } catch (error: any) {
      return response.ko(error.message);
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

      const itinerary = await db.insert<ITB_ITINERARY, ITB_ITINERARY>(TABLE_ITINERARY, {
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
        created_dt: now,
        created_by: req.user!.username,
        record_status: "A",
      });

      const agendaToFileMap: { agendaId: number; fileUuids: string[] }[] = [];

      for (const item of agendaItems) {
        const agendaItem = await db.insert<ITB_AGENDA_ITEM, ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, {
          itinerary_id: itinerary.id!,
          category: item.category || undefined,
          title: item.title,
          desc: item.desc || undefined,
          city: item.city || undefined,
          city_raw: item.cityRaw?.length ? JSON.stringify(item.cityRaw) : undefined,
          start_time: item.startTime || undefined,
          end_time: item.endTime || undefined,
          duration_in_hours: item.durationInHours || undefined,
          unknown_time: item.unknownTime ? 1 : 0,
          budget: item.budget || undefined,
          day: item.day || undefined,
          date: item.date || undefined,
          created_dt: now,
          record_status: "A",
        });

        agendaToFileMap.push({
          agendaId: agendaItem.id!,
          fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [],
        });
      }

      return response.ok({ shortCode, sessionId, agendaToFileMap });
    } catch (error: any) {
      return response.ko(error.message);
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

      const agendaItems = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { itinerary_id: itinerary.id!, record_status: "A" }, { orderBy: "day", orderDirection: "asc" }) as ITB_AGENDA_ITEM[];

      const itemsWithFiles = await Promise.all(
        agendaItems.map(async (item) => {
          const files = await db.find(TABLE_AGENDA_FILE, { agenda_item_id: item.id!, record_status: "A" });
          return { ...item, files };
        })
      );

      return response.ok(buildItineraryResponse(itinerary, itemsWithFiles));
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  // GET /:sessionId — planner load (file metadata only, no blobs)
  router.get("/:sessionId", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { sessionId } = req.params;

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      const agendaItems = await db.find<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { itinerary_id: itinerary.id!, record_status: "A" }, { orderBy: "day", orderDirection: "asc" }) as ITB_AGENDA_ITEM[];

      const itemsWithFiles = await Promise.all(
        agendaItems.map(async (item) => {
          const files = await db.find(TABLE_AGENDA_FILE, { agenda_item_id: item.id!, record_status: "A" }, {
            columns: ["id", "uuid", "name", "mime_type", "size_in_bytes", "created_dt"],
          });
          return { ...item, files };
        })
      );

      return response.ok(buildItineraryResponse(itinerary, itemsWithFiles));
    } catch (error: any) {
      return response.ko(error.message);
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
      } = req.body;

      const itinerary = await db.findOne<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId, record_status: "A" }) as ITB_ITINERARY | undefined;
      if (!itinerary) return response.badRequest("Itinerary not found");

      if (itinerary.created_by !== req.user!.username) return response.result(403, "Forbidden", "You do not have permission to edit this itinerary");

      const now = Date.now();

      await db.update<ITB_ITINERARY>(TABLE_ITINERARY, { session_id: sessionId }, {
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
      });

      // Soft-delete removed agenda items
      for (const agendaId of _agendaIdsToDelete) {
        await db.update<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { id: Number(agendaId) }, { record_status: "D" });
      }

      const agendaToFileMap: { agendaId: number; fileUuids: string[] }[] = [];

      for (const item of agendaItems) {
        if (item.id) {
          // Update existing — save current state regardless of _agendaIdsToUpdate
          // Accept both camelCase (from frontend store) and snake_case (round-tripped from DB)
          const cityRaw = item.cityRaw ?? item.city_raw;
          const startTime = item.startTime ?? item.start_time;
          const endTime = item.endTime ?? item.end_time;
          const unknownTime = item.unknownTime ?? item.unknown_time;
          const durationInHours = item.durationInHours ?? item.duration_in_hours;
          await db.update<ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, { id: Number(item.id) }, {
            category: item.category || undefined,
            title: item.title,
            desc: item.desc || undefined,
            city: item.city || undefined,
            city_raw: cityRaw?.length ? JSON.stringify(cityRaw) : undefined,
            start_time: startTime || undefined,
            end_time: endTime || undefined,
            duration_in_hours: durationInHours || undefined,
            unknown_time: unknownTime ? 1 : 0,
            budget: item.budget || undefined,
            day: item.day || undefined,
            date: item.date || undefined,
          });
          agendaToFileMap.push({
            agendaId: Number(item.id),
            fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [],
          });
        } else {
          // Insert new
          const newItem = await db.insert<ITB_AGENDA_ITEM, ITB_AGENDA_ITEM>(TABLE_AGENDA_ITEM, {
            itinerary_id: itinerary.id!,
            category: item.category || undefined,
            title: item.title,
            desc: item.desc || undefined,
            city: item.city || undefined,
            city_raw: item.cityRaw?.length ? JSON.stringify(item.cityRaw) : undefined,
            start_time: item.startTime || undefined,
            end_time: item.endTime || undefined,
            duration_in_hours: item.durationInHours || undefined,
            unknown_time: item.unknownTime ? 1 : 0,
            budget: item.budget || undefined,
            day: item.day || undefined,
            date: item.date || undefined,
            created_dt: now,
            record_status: "A",
          });
          agendaToFileMap.push({
            agendaId: newItem.id!,
            fileUuids: Array.isArray(item._agendaToFileMapping) ? item._agendaToFileMapping : [],
          });
        }
      }

      return response.ok({ shortCode: itinerary.short_code, sessionId, agendaToFileMap });
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  return router;
}

function buildItineraryResponse(itinerary: ITB_ITINERARY, agendaItems: any[]) {
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
    agendaItems: agendaItems.map(({ record_status, created_dt, ...item }: any) => ({
      ...item,
      files: item.files?.map(({ record_status: _rs, created_dt: _cd, ...file }: any) => file) ?? [],
    })),
  };
}
