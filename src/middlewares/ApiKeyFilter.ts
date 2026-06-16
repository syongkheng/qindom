import { NextFunction, Request, Response } from "express";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { HeaderValidationUtilities } from "../utils/HeaderValidationUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import db from "../config/db/mysql.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { ITbSsApiKey } from "../models/databases/tb_ss_api_key.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";

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
      if (!user) {
        apiKeyValidationLoggingEvent?.children?.push(`User Exists: ${LogEmoji.error} `);
        throw new Exceptions.InvalidRequest("Invalid API key");
      }
      apiKeyValidationLoggingEvent?.children?.push(`User Exists: ${LogEmoji.success} `);
      logContext.metadata = {
        ...logContext.metadata,
        username: user.username,
        userId: validKeys.user_id,
      };
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
