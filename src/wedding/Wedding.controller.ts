import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { WeddingValidator } from "./Wedding.validator.js";
import { WeddingService } from "./Wedding.service.js";
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
      const result = await weddingService.submitRsvp(payload, logContext);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "WeddingController.POST /rsvp", "Failed to submit RSVP");
    }
  });

  // Lets the frontend check whether an email already has an RSVP and, if
  // so, fetch it to pre-fill the form for editing rather than the user
  // re-entering everything from scratch.
  router.get("/rsvp", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    const logContext: IRequestLogContext = req.logContext;

    const validationEvent = logContext
      ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Query params")
      : undefined;

    try {
      const email = await weddingValidator.findRsvpByEmailQuery(req, validationEvent);
      const rsvp = await weddingService.findRsvpByEmail(email);
      return cr.ok({ found: rsvp !== null, rsvp });
    } catch (err) {
      return handleException(err, cr, "WeddingController.GET /rsvp", "Failed to look up RSVP");
    }
  });

  return router;
}
