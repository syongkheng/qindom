import { Request } from "express";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

export class GarminValidator {
  validateSummaryQuery(req: Request, loggingEvent?: IRequestLogEvent): number {
    const { days } = req.query;

    if (days === undefined) {
      loggingEvent?.children?.push(`(O) 'days' defaulted to ${DEFAULT_DAYS} ${LogEmoji.warning}`);
      return DEFAULT_DAYS;
    }

    if (typeof days !== "string" || !/^\d+$/.test(days) || Number(days) < 1 || Number(days) > MAX_DAYS) {
      loggingEvent?.children?.push(`'days' must be an integer between 1 and ${MAX_DAYS} ${LogEmoji.error}`);
      throw new InvalidRequestException("days", "format");
    }

    loggingEvent?.children?.push(`'days' validated ${LogEmoji.success}`);
    return Number(days);
  }
}
