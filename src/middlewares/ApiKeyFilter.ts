import { NextFunction, Request, Response } from "express";
import { IRequestLogContext } from "../models/IRequestLogContext";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import db from "../config/db/mysql";

export const RequestApiKeyFilter = async function (req: Request, res: Response, next: NextFunction) {
  const cr = new ControllerResponse(req, res);
  const logContext: IRequestLogContext = req.logContext;

  // Header Validation
  const apiKeyValidationLoggingEvent = logContext
    ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Specific headers")
    : undefined;

  try {
    const apiKey = HeaderValidationUtilities.required(req.headers, "x-api-key", apiKeyValidationLoggingEvent);

    const apiKeyExist = await db.findOne("tb_llm_api_key")



    logContext.metadata = {
      ...logContext.metadata,
      apiKey,
    };
  } catch (err) {
    return cr.badAuthorization("Unauthorized. Missing or invalid API key.");
  }

  next();
};
