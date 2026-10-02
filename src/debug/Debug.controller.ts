import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException, hasRole } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const isPrd = process.env.NODE_ENV === "prd";

// Throws from a nested call so the logged stack has a real frame to point at.
function simulateUnhandledFailure(): never {
  throw new Error("Simulated unhandled exception from /debug/status/500");
}

// Test-only endpoint for exercising the response/logging pipeline (request
// tree, Telegram compact alerts, Log Searcher). Open in dev; in prd it's
// mounted behind MandatoryTokenFilter (see index.ts) and limited to SYSTEM_R5.
export default function createDebugController(_db: KnexSqlUtilities) {
  const router = Router();

  // GET /debug/status/:code — responds with that status (200–599).
  // 500 goes through a real thrown Error → handleException (exception + stack);
  // every other code is returned directly.
  router.get("/status/:code", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      if (isPrd && !hasRole(req, "SYSTEM_R5")) throw new Exceptions.ForbiddenAccess();

      const code = Number(req.params.code);
      if (!Number.isInteger(code) || code < 200 || code > 599) {
        throw new Exceptions.InvalidRequest("code", "format");
      }

      if (req.logContext) {
        LoggingUtilities.request.branch(req.logContext, "SERVICE", `Simulating HTTP ${code}`);
      }

      if (code === 500) simulateUnhandledFailure();
      if (code < 300) return cr.result(code, "Ok", { simulated: code });
      return cr.result(code, code < 500 ? `debug_${code}` : "Ko", `Simulated ${code} response`);
    } catch (err) {
      return handleException(err, cr, "DebugController.GET /status/:code", "Simulated failure");
    }
  });

  return router;
}
