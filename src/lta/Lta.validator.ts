import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

const BUS_STOP_CODE_REGEX = /^\d{5}$/;

export class LtaValidator {
  static validateBusStopCodeFromQuery(
    query: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { busStopCode: string } {
    const { busStopCode: raw } = query;
    V.requiredString(raw, "busStopCode", loggingEvent);
    const busStopCode = (raw as string).trim();
    V.regex(busStopCode, BUS_STOP_CODE_REGEX, "busStopCode", loggingEvent);
    return { busStopCode };
  }

  static validateBusStopCodeFromBody(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { busStopCode: string } {
    const { busStopCode: raw } = body;
    V.requiredString(raw, "busStopCode", loggingEvent);
    const busStopCode = (raw as string).trim();
    V.regex(busStopCode, BUS_STOP_CODE_REGEX, "busStopCode", loggingEvent);
    return { busStopCode };
  }
}
