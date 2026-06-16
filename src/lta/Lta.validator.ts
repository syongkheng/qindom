import { Request } from "express";
import { Exceptions } from "../exceptions/AppExceptions.js";

const BUS_STOP_CODE_REGEX = /^\d{5}$/;

export class LtaValidator {
  static validateBusStopCodeFromQuery(req: Request): { busStopCode: string } {
    const raw = req.query.busStopCode;
    const busStopCode = typeof raw === "string" ? raw.trim() : undefined;
    if (!busStopCode || !BUS_STOP_CODE_REGEX.test(busStopCode)) {
      throw new Exceptions.InvalidRequest("busStopCode");
    }
    return { busStopCode };
  }

  static validateBusStopCodeFromBody(req: Request): { busStopCode: string } {
    const raw = req.body?.busStopCode;
    const busStopCode = typeof raw === "string" ? raw.trim() : undefined;
    if (!busStopCode || !BUS_STOP_CODE_REGEX.test(busStopCode)) {
      throw new Exceptions.InvalidRequest("busStopCode");
    }
    return { busStopCode };
  }
}
