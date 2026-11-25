import { NextFunction, Request, Response, Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { handleException } from "../utils/requestUtils.js";
import { MailerUtilities } from "../utils/MailerUtilities.js";
import { pdcaEnquiryLimiter } from "../middlewares/RateLimiter.js";
import { AnalyticSystemService } from "../analytics/AnalyticSystem.service.js";
import { isOriginAllowed } from "../analytics/AnalyticsContract.js";
import {
  autoReplyMail,
  EnquirySchema,
  isSpam,
  loggablePayload,
  notificationMail,
  PDCA_ENQUIRY_SYSTEM,
  PDCA_ENQUIRY_TO_DEFAULT,
} from "./PdcaEnquiry.js";

/**
 * Replaces the request-log payload (captured by RestRequestLogger, which also feeds Telegram alerts)
 * with field lengths, so names, phone numbers and messages never reach the logs.
 */
export const stripPersonalDataFromLog = (req: Request, _res: Response, next: NextFunction) => {
  if (req.logContext) req.logContext.payload = loggablePayload(req.body);
  next();
};

/**
 * PDCA website — mounted at /pdca (public).
 *  POST /enquiry   contact form: validates, emails the lab (PDCA_ENQUIRY_TO, default admin@pdcadental.com)
 *                  and auto-replies to the visitor. Stores nothing. Origin must be in the dental-directory
 *                  system's allowed_origins; 5 per 10 min per IP; honeypot field `website` must be empty.
 */
export default function createPdcaEnquiryController(db: KnexSqlUtilities) {
  const router = Router();
  const systems = new AnalyticSystemService(db);

  router.post("/enquiry", [pdcaEnquiryLimiter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const system = await systems.getActive(PDCA_ENQUIRY_SYSTEM);
      if (!system || !isOriginAllowed(system, req.headers.origin)) throw new Exceptions.ForbiddenAccess();

      const parsed = EnquirySchema.safeParse(req.body);
      if (!parsed.success) throw new Exceptions.InvalidRequest(parsed.error.issues[0]?.path.join(".") || "body", "format");
      const enquiry = parsed.data;

      // Bots that fill the hidden field get the same success answer, and nothing is sent.
      if (isSpam(enquiry)) return cr.ok({ message: "Received" });

      const labEmail = process.env.PDCA_ENQUIRY_TO || PDCA_ENQUIRY_TO_DEFAULT;
      await MailerUtilities.sendMail(notificationMail(enquiry, labEmail));
      const reply = autoReplyMail(enquiry, labEmail);
      if (reply) {
        // The lab already has the message; a failed auto-reply must not turn into an error for the visitor.
        await MailerUtilities.sendMail(reply).catch(() => undefined);
      }
      return cr.ok({ message: "Received" });
    } catch (err) {
      return handleException(err, cr, "PdcaEnquiryController.POST /enquiry", "Failed to send the enquiry");
    }
  });

  return router;
}
