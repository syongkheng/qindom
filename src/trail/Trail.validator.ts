import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

export class TrailValidator {
  static validateCreateSession(body: any, loggingEvent?: IRequestLogEvent): {
    trailId: string; trailName: string; trailType: string;
    status: string; startedAt: number;
  } {
    const { trailId, trailName, trailType, status, startedAt } = body ?? {};
    V.requiredString(trailId, "trailId", loggingEvent);
    V.requiredString(trailName, "trailName", loggingEvent);
    V.requiredNumber(startedAt, "startedAt", loggingEvent);
    return { trailId, trailName, trailType: trailType ?? "preset", status: status ?? "active", startedAt };
  }

  static validateCompleteSession(body: any, loggingEvent?: IRequestLogEvent): {
    status: string; completedAt?: number; totalKm: number; totalSteps: number;
    totalDurationSeconds: number; checkpointsReached: string[]; splits: any[]; trackPoints: any[];
  } {
    const {
      status, completedAt, totalKm, totalSteps, totalDurationSeconds,
      checkpointsReached = [], splits = [], trackPoints = [],
    } = body ?? {};
    V.requiredString(status, "status", loggingEvent);
    return {
      status, completedAt, totalKm: Number(totalKm ?? 0), totalSteps: Number(totalSteps ?? 0),
      totalDurationSeconds: Number(totalDurationSeconds ?? 0), checkpointsReached, splits, trackPoints,
    };
  }

  static validateCreateCustomTrail(body: any, loggingEvent?: IRequestLogEvent): {
    name: string; country: string; totalKm: number;
    difficulty: string; estimatedDays: number; description?: string;
  } {
    const { name, country, totalKm, difficulty, estimatedDays, description } = body ?? {};
    V.requiredString(name, "name", loggingEvent);
    V.requiredNumber(totalKm, "totalKm", loggingEvent);
    return {
      name: name.trim(), country: (country ?? "Custom").trim(),
      totalKm: Number(totalKm), difficulty: difficulty ?? "moderate",
      estimatedDays: Number(estimatedDays ?? 1), description,
    };
  }
}
