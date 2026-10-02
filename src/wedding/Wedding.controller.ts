import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { WeddingValidator } from "./Wedding.validator.js";
import { WeddingService, WEDDING_PDPA_NOTICE } from "./Wedding.service.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

export default function createWeddingController(db: KnexSqlUtilities) {
  const router = Router();
  const weddingValidator = new WeddingValidator(db);
  const weddingService = new WeddingService(db);

  router.post("/rsvp", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;

    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
      : undefined;

    try {
      const payload = await weddingValidator.validateRsvpPayload(req, validationEvent);
      // `rsvpId` (the underlying auto-increment id) is intentionally not
      // sent to the client — `pin` is the identifier guests are meant to
      // share/use, and a sequential id would make every other guest's
      // record trivially enumerable.
      const { pin } = await weddingService.submitRsvp(payload, logContext);
      return cr.ok({ pin, notice: WEDDING_PDPA_NOTICE });
    } catch (err) {
      return handleException(err, cr, "WeddingController.POST /rsvp", "Failed to submit RSVP");
    }
  });

  // Step-1 existence check for the RSVP form: name → { exists, hasEmail }.
  // Booleans only, no personal data.
  router.post("/rsvp/preflight", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;
    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
      : undefined;
    try {
      const { name } = weddingValidator.validateNameBody(req, validationEvent);
      return cr.ok(await weddingService.checkRsvpExistsByName(name));
    } catch (err) {
      return handleException(err, cr, "WeddingController.POST /rsvp/preflight", "Failed to check RSVP");
    }
  });

  // "Forgot PIN": emails the pin to the RSVP's registered address if there is
  // one. Returns { exists, hasEmail, sent } — never the pin itself.
  router.post("/rsvp/recover-pin", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;
    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
      : undefined;
    try {
      const { name } = weddingValidator.validateNameBody(req, validationEvent);
      return cr.ok(await weddingService.recoverPinByName(name));
    } catch (err) {
      return handleException(err, cr, "WeddingController.POST /rsvp/recover-pin", "Failed to recover PIN");
    }
  });

  // Locked-down lookup: a guest proves their identity with BOTH their name and
  // the 4-digit RSVP pin. On success they see only their own details plus whose
  // RSVP they're on ("guest of YK") — never the other guests' details. A pin or
  // name alone reveals nothing, and a mismatch is reported as a plain
  // not-found so it can't be used to enumerate names or pins.
  router.get("/rsvp", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;

    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query params")
      : undefined;

    try {
      const { name, pin } = await weddingValidator.validateRsvpLookupQuery(req, validationEvent);
      const rsvp = await weddingService.lookupRsvpByNameAndPin(name, pin);
      return cr.ok({ found: rsvp !== null, rsvp });
    } catch (err) {
      return handleException(err, cr, "WeddingController.GET /rsvp", "Failed to look up RSVP");
    }
  });

  // Public status check — a guest can look up whether their RSVP (or one
  // they were added to as a guest) has been recorded, using either the
  // 4-digit pin from their confirmation screen or their name.
  router.get("/rsvp/status", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;

    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query params")
      : undefined;

    try {
      const { name, pin } = await weddingValidator.validateRsvpStatusQuery(req, validationEvent);
      const match = await weddingService.findRsvpStatusByNameAndPin(name, pin);
      return cr.ok({ matches: match ? [match] : [] });
    } catch (err) {
      return handleException(err, cr, "WeddingController.GET /rsvp/status", "Failed to look up RSVP status");
    }
  });

  return router;
}
