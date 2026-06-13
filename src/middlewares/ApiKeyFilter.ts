import { NextFunction, Request, Response } from "express";
import { IRequestLogContext } from "../models/IRequestLogContext";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import db from "../config/db/mysql";
import { LogEmoji } from "../constants/LogEmoji";
import { Exceptions } from "../exceptions/AppExceptions";
import { ITbSsApiKey } from "../models/databases/tb_ss_api_key";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";

export const RequestApiKeyFilter = async function (req: Request, res: Response, next: NextFunction) {
  const cr = new ControllerResponse(req, res);
  const logContext: IRequestLogContext = req.logContext;

  // Header Validation
  const apiKeyValidationLoggingEvent = logContext
    ? LoggingUtilities.request.branch(logContext, "VALIDATION", "Specific headers")
    : undefined;

  try {
    const apiKey = HeaderValidationUtilities.required(req.headers, "x-api-key", apiKeyValidationLoggingEvent);

    const apiKeyPrefix = apiKey.split("_")[0];

    const apiKeyValue = apiKey.split("_")[1];

    apiKeyValidationLoggingEvent?.children?.push(`Prefix: '${apiKeyPrefix}'`);

    if (apiKeyPrefix === "ss") {
      const validKeys = await db.findOne<ITbSsApiKey>(
        "tb_ss_api_key",
        { api_key_prefix: apiKeyPrefix, api_key_hash: apiKeyValue, record_status: "A" },
        ["*"],
        apiKeyValidationLoggingEvent,
      );
      if (!validKeys) {
        apiKeyValidationLoggingEvent?.children?.push(`Key Validity: ${LogEmoji.error} `);
        throw new Exceptions.InvalidRequest("Invalid API key");
      }
      apiKeyValidationLoggingEvent?.children?.push(`Key Validity: ${LogEmoji.success} `);
      const user = await db.findOne<ITB_AA_USER>(
        "tb_aa_user",
        { id: validKeys.user_id },
        ["username"],
        apiKeyValidationLoggingEvent,
      );
      if (user) {
        logContext.metadata = {
          ...logContext.metadata,
          username: user.username,
        };
      }
    }

    logContext.metadata = {
      ...logContext.metadata,
      apiKey,
    };
  } catch (err) {
    return cr.badAuthorization("Unauthorized. Missing or invalid API key.");
  }

  next();
};
