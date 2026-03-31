import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { WeddingService } from "./Wedding.service";
import { createWeddingDatesRouter } from "./Wedding.dates.controller";
import { createWeddingEventsRouter } from "./Wedding.events.controller";
import { createWeddingGuestsRouter } from "./Wedding.guests.controller";
import { createWeddingTablesRouter } from "./Wedding.tables.controller";

export default function createWeddingController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new WeddingService(db);
  // Specific sub-paths must be mounted before "/" to prevent /:shortCode from swallowing them
  router.use("/events", createWeddingEventsRouter(svc));
  router.use("/guests", createWeddingGuestsRouter(svc));
  router.use("/tables", createWeddingTablesRouter(svc));
  router.use("/", createWeddingDatesRouter(svc));
  return router;
}
