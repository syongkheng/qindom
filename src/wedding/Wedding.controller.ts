import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { weddingRsvpLimiter } from "../middlewares/RateLimiter.js";
import { clientIp, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { WeddingService } from "./Wedding.service.js";
import { WeddingVisitNotifier } from "./Wedding.visitNotifier.js";
import {
  sanitiseVisitBody,
  validatePreflightBody,
  validateRsvpBody,
  validateStatusQuery,
} from "./Wedding.validator.js";
import { WeddingRsvpPreflightDto, WeddingRsvpStatusDto, WeddingRsvpSubmittedDto } from "./Wedding.types.js";

/** The visit beacon has nothing to return; 204 keeps it body-less (jessikheng ignores the response). */
const NO_CONTENT = 204;

/** Wedding site (jessikheng), mounted at /wedding with `mw.std` (public). See README.md. */
export default function createWeddingController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new WeddingService(db);
  const visitNotifier = new WeddingVisitNotifier(db);

  // Page-view ping: relays a Telegram alert only (nothing stored). Answers 204 at once; the send runs after.
  router.post(
    "/visit",
    route("WeddingController.POST /visit", "Failed to record the visit", (req, _cr, res) => {
      void visitNotifier.notify({
        ...sanitiseVisitBody(req.body),
        ip: clientIp(req),
        userAgent: req.headers["user-agent"] ?? "",
      });
      res.status(NO_CONTENT).end();
    }),
  );

  router.post(
    "/rsvp",
    weddingRsvpLimiter,
    route("WeddingController.POST /rsvp", "Failed to submit RSVP", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const rsvp = validateRsvpBody(req.body, event);
      return cr.ok<WeddingRsvpSubmittedDto>(await svc.submitRsvp(rsvp, req.logContext));
    }),
  );

  router.post(
    "/rsvp/preflight",
    route("WeddingController.POST /rsvp/preflight", "Failed to check RSVP", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { email } = validatePreflightBody(req.body, event);
      return cr.ok<WeddingRsvpPreflightDto>(await svc.checkRsvpExistsByEmail(email, req.logContext));
    }),
  );

  router.get(
    "/rsvp/status",
    route("WeddingController.GET /rsvp/status", "Failed to look up RSVP status", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Query params");
      const match = await svc.findRsvpStatus(validateStatusQuery(req.query, event), req.logContext);
      return cr.ok<WeddingRsvpStatusDto>({ matches: match ? [match] : [] });
    }),
  );

  return router;
}
