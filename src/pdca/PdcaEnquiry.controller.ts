import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { route } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { pdcaEnquiryLimiter } from "../middlewares/RateLimiter.js";
import { AnalyticSystemService } from "../analytics/AnalyticSystem.service.js";
import { isEnquiryOriginAllowed, PDCA_ENQUIRY_SYSTEM, PdcaEnquiryService } from "./PdcaEnquiry.service.js";
import { validateEnquiryBody } from "./PdcaEnquiry.validator.js";
import { PdcaEnquiryReceivedDto } from "./PdcaEnquiry.types.js";

const RECEIVED: PdcaEnquiryReceivedDto = { message: "Received" };

/**
 * PDCA website, mounted at /pdca (public; personal data stripped from logs by
 * `stripPersonalDataFromLog`). POST /enquiry: Origin is required and must be in the dental-directory system's
 * allowed_origins; 5 per 10 min per IP; honeypot `website` must be empty.
 */
export default function createPdcaEnquiryController(db: KnexSqlUtilities): Router {
  const router = Router();
  const systems = new AnalyticSystemService(db);
  const svc = new PdcaEnquiryService();

  router.post(
    "/enquiry",
    pdcaEnquiryLimiter,
    route("PdcaEnquiryController.POST /enquiry", "Failed to send the enquiry", async (req, cr) => {
      const system = await systems.getActive(PDCA_ENQUIRY_SYSTEM);
      if (!isEnquiryOriginAllowed(system, req.headers.origin)) throw new Exceptions.ForbiddenAccess();

      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const enquiry = validateEnquiryBody(req.body, event);
      await svc.submit(enquiry, req.logContext);
      return cr.ok<PdcaEnquiryReceivedDto>(RECEIVED);
    }),
  );

  return router;
}
