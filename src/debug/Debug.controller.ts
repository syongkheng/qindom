import { Router } from "express";
import { ResponseStatus } from "../models/responses/ControllerResponse.js";
import { requireRole, route } from "../utils/requestUtils.js";
import { Roles } from "../auth/Permission.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IS_PRD } from "../config/env.js";
import { DebugStatusDto } from "./Debug.types.js";

const MIN_STATUS = 200;
const MAX_STATUS = 599;
const FIRST_NON_SUCCESS_STATUS = 300;
const FIRST_SERVER_ERROR_STATUS = 500;
const INTERNAL_SERVER_ERROR = 500;

// Throws from a nested call so the logged stack has a real frame to point at.
function simulateUnhandledFailure(): never {
  throw new Error("Simulated unhandled exception from /debug/status/500");
}

/**
 * Test-only endpoint for exercising the response/logging pipeline (request tree,
 * Telegram compact alerts, Log Searcher). Open in dev; in prd it's mounted behind
 * MandatoryTokenFilter (see index.ts) and limited to OWNER.
 */
export default function createDebugController(): Router {
  const router = Router();

  // 500 goes through a real thrown Error → handleException (exception + stack);
  // every other code is returned directly.
  router.get(
    "/status/:code",
    route("DebugController.GET /status/:code", "Simulated failure", async (req, cr) => {
      if (IS_PRD) requireRole(req, Roles.OWNER);

      const code = Number(req.params.code);
      if (!Number.isInteger(code) || code < MIN_STATUS || code > MAX_STATUS) {
        throw new Exceptions.InvalidRequest("code", "format");
      }

      LoggingUtilities.request.branch(req.logContext, "SERVICE", `Simulating HTTP ${code}`);

      if (code === INTERNAL_SERVER_ERROR) simulateUnhandledFailure();
      if (code < FIRST_NON_SUCCESS_STATUS) {
        return cr.result(code, ResponseStatus.OK, { simulated: code } satisfies DebugStatusDto);
      }
      const status = code < FIRST_SERVER_ERROR_STATUS ? `debug_${code}` : ResponseStatus.KO;
      return cr.result(code, status, `Simulated ${code} response`);
    }),
  );

  return router;
}
