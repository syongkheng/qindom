import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const BUS_STOP_CODE_REGEX = /^\d{5}$/;

export class LtaValidator {
  static validateBusStopCodeFromQuery(
    query: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { busStopCode: string } {
    const { busStopCode: raw } = query;
    StructuralValidationUtilities.required(raw, "busStopCode", event);
    StructuralValidationUtilities.string(raw, "busStopCode", event);
    const busStopCode = (raw as string).trim();
    if (!BUS_STOP_CODE_REGEX.test(busStopCode)) {
      event?.children?.push(`'busStopCode' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'busStopCode' must be a 5-digit code");
    }
    event?.children?.push(`'busStopCode' format ${LogEmoji.success} `);
    return { busStopCode };
  }

  static validateBusStopCodeFromBody(
    body: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { busStopCode: string } {
    const { busStopCode: raw } = body;
    StructuralValidationUtilities.required(raw, "busStopCode", event);
    StructuralValidationUtilities.string(raw, "busStopCode", event);
    const busStopCode = (raw as string).trim();
    if (!BUS_STOP_CODE_REGEX.test(busStopCode)) {
      event?.children?.push(`'busStopCode' format ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'busStopCode' must be a 5-digit code");
    }
    event?.children?.push(`'busStopCode' format ${LogEmoji.success} `);
    return { busStopCode };
  }
}
