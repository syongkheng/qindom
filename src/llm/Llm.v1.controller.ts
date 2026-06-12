import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { OptionalTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { handleException } from "../utils/requestUtils";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities";
import { LlmServiceV1 } from "./Llm.v1.service";
import { IRequestLogContext } from "../models/IRequestLogContext";

export default function createLlmControllerV1(db: KnexSqlUtilities) {
  const router = Router();
  const llmServiceV1 = new LlmServiceV1(db);

  router.post("/message", [OptionalTokenFilter], async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const logContext: IRequestLogContext = req.logContext;

      console.log("Metadata:", logContext.metadata); // Log metadata for debugging

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
