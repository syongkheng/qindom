import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

export class TrailValidator {
  static validateCreateSession(req: Request): {
    trailId: string; trailName: string; trailType: string;
    status: string; startedAt: number;
  } {
    const { trailId, trailName, trailType, status, startedAt } = req.body;
    if (!trailId) throw new InvalidRequestException("trailId");
    if (!trailName) throw new InvalidRequestException("trailName");
    if (!startedAt) throw new InvalidRequestException("startedAt");
    return { trailId, trailName, trailType: trailType ?? "preset", status: status ?? "active", startedAt };
  }

  static validateCompleteSession(req: Request): {
    status: string; completedAt?: number; totalKm: number; totalSteps: number;
    totalDurationSeconds: number; checkpointsReached: string[]; splits: any[]; trackPoints: any[];
  } {
    const {
      status, completedAt, totalKm, totalSteps, totalDurationSeconds,
      checkpointsReached = [], splits = [], trackPoints = [],
    } = req.body;
    if (!status) throw new InvalidRequestException("status");
    return {
      status, completedAt, totalKm: Number(totalKm ?? 0), totalSteps: Number(totalSteps ?? 0),
      totalDurationSeconds: Number(totalDurationSeconds ?? 0), checkpointsReached, splits, trackPoints,
    };
  }

  static validateCreateCustomTrail(req: Request): {
    name: string; country: string; totalKm: number;
    difficulty: string; estimatedDays: number; description?: string;
  } {
    const { name, country, totalKm, difficulty, estimatedDays, description } = req.body;
    if (!name) throw new InvalidRequestException("name");
    if (!totalKm) throw new InvalidRequestException("totalKm");
    return {
      name: name.trim(), country: (country ?? "Custom").trim(),
      totalKm: Number(totalKm), difficulty: difficulty ?? "moderate",
      estimatedDays: Number(estimatedDays ?? 1), description,
    };
  }
}
