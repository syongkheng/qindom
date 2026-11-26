import { Request, Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import { itineraryChallengeLimiter } from "../middlewares/RateLimiter.js";
import { clientIp, getUser, route } from "../utils/RequestUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ItineraryService } from "./Itinerary.service.js";
import { ItinerarySaveService } from "./ItinerarySave.service.js";
import { validateChallengeBody, validateCreateBody, validateUpdateBody } from "./Itinerary.validator.js";
import {
  ItineraryChallengeRequiredDto,
  ItineraryDeletedDto,
  ItineraryDto,
  ItineraryListDto,
  ItinerarySavedDto,
} from "./Itinerary.types.js";

const UNKNOWN = "Unknown";

const validationEvent = (req: Request) => LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
const userAgent = (req: Request) => req.headers["user-agent"] || UNKNOWN;

/**
 * Trips. Mounted with `mw.std`: the owner routes add `MandatoryTokenFilter` per route, while the
 * share routes (`GET /v/:shortCode`, `POST /challenge`) are public.
 */
export default function createItineraryController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ItineraryService(db);
  const saveSvc = new ItinerarySaveService(db);

  router.get(
    "/",
    MandatoryTokenFilter,
    route("ItineraryController.GET /", "Failed to load itineraries", async (req, cr) =>
      cr.ok<ItineraryListDto>(await svc.listTrips(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/",
    MandatoryTokenFilter,
    route("ItineraryController.POST /", "Failed to create itinerary", async (req, cr) => {
      const body = validateCreateBody(req.body, validationEvent(req));
      return cr.ok<ItinerarySavedDto>(await saveSvc.create(getUser(req).id, body, req.logContext));
    }),
  );

  // Public: a wrong code is a 400, and only failed attempts count towards the limiter (10 / 15 min / IP).
  router.post(
    "/challenge",
    itineraryChallengeLimiter,
    route("ItineraryController.POST /challenge", "Failed to verify challenge", async (req, cr) => {
      const { shortCode, challenge } = validateChallengeBody(req.body, validationEvent(req));
      const itinerary = await svc.verifyChallenge(shortCode, challenge, req.logContext);
      void svc.recordView(shortCode, clientIp(req), userAgent(req));
      return cr.ok<ItineraryDto>(itinerary);
    }),
  );

  // Public viewer. Views are counted only when the trip is actually shown (no access code).
  router.get(
    "/v/:shortCode",
    route("ItineraryController.GET /v/:shortCode", "Failed to load itinerary", async (req, cr) => {
      const result = await svc.getByShortCode(req.params.shortCode, req.logContext);
      if (!("hasChallenge" in result)) void svc.recordView(req.params.shortCode, clientIp(req), userAgent(req));
      return cr.ok<ItineraryDto | ItineraryChallengeRequiredDto>(result);
    }),
  );

  router.get(
    "/:sessionId",
    MandatoryTokenFilter,
    route("ItineraryController.GET /:sessionId", "Failed to load itinerary", async (req, cr) =>
      cr.ok<ItineraryDto>(await svc.getBySessionId(getUser(req).id, req.params.sessionId, req.logContext)),
    ),
  );

  router.post(
    "/:sessionId/update",
    MandatoryTokenFilter,
    route("ItineraryController.POST /:sessionId/update", "Failed to update itinerary", async (req, cr) => {
      const body = validateUpdateBody(req.body, validationEvent(req));
      return cr.ok<ItinerarySavedDto>(
        await saveSvc.update(getUser(req).id, req.params.sessionId, body, req.logContext),
      );
    }),
  );

  router.post(
    "/:sessionId/delete",
    MandatoryTokenFilter,
    route("ItineraryController.POST /:sessionId/delete", "Failed to delete itinerary", async (req, cr) =>
      cr.ok<ItineraryDeletedDto>(await svc.deleteTrip(getUser(req).id, req.params.sessionId, req.logContext)),
    ),
  );

  return router;
}
