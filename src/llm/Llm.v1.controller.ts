import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { OptionalTokenFilter } from "../middlewares/TokenFilter.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { handleException } from "../utils/requestUtils.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { LlmServiceV1 } from "./Llm.v1.service.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";

export default function createLlmControllerV1(db: KnexSqlUtilities) {
  const router = Router();
  const llmServiceV1 = new LlmServiceV1(db);

  router.post("/message", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      // Request Structure Validation

      const requestBodyStructuralValidationLoggingEvent = logContext
        ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Request body")
        : undefined;
      const { message, model } = req.body;

      StructuralValidationUtilities.required(message, "message", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.string(message, "message", requestBodyStructuralValidationLoggingEvent);

      StructuralValidationUtilities.required(model, "model", requestBodyStructuralValidationLoggingEvent);
      StructuralValidationUtilities.string(model, "model", requestBodyStructuralValidationLoggingEvent);

      // Calling of service
      const serviceResponse = await llmServiceV1.sendMessage(message, model, logContext);

      return cr.ok(serviceResponse);
    } catch (err) {
      return handleException(err, cr, "LlmControllerV1.POST /message", "Failed to record message");
    }
  });

  return router;
}
