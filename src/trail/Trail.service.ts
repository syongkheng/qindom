import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_TRAIL_SESSION } from "../models/databases/tb_trail_session";
import { ITB_TRAIL_SPLIT } from "../models/databases/tb_trail_split";
import { ITB_TRAIL_CUSTOM } from "../models/databases/tb_trail_custom";
import { LoggingUtilities } from "../utils/LoggingUtilities";

const TB_TRAIL_SESSION = "tb_trail_session";
const TB_TRAIL_SPLIT   = "tb_trail_split";
const TB_TRAIL_CUSTOM  = "tb_trail_custom";

function buildSessionResponse(row: ITB_TRAIL_SESSION, splits: ITB_TRAIL_SPLIT[], includeTrack = false): any {
  return {
    sessionId:            row.session_id,
    trailId:              row.trail_id,
    trailName:            row.trail_name,
    trailType:            row.trail_type,
    status:               row.status,
    startedAt:            row.started_at,
    completedAt:          row.completed_at ?? null,
    totalKm:              Number(row.total_km),
    totalSteps:           Number(row.total_steps),
    totalDurationSeconds: Number(row.total_duration_seconds),
    checkpointsReached:   safeJsonParse(row.checkpoints_reached, []),
    trackPoints:          includeTrack ? safeJsonParse(row.track_points, []) : [],
    splits:               splits.filter((s) => s.record_status === "A").map((s) => ({
      id:              s.id,
      kmMark:          Number(s.km_mark),
      durationSeconds: Number(s.duration_seconds),
      steps:           s.steps ? Number(s.steps) : undefined,
      lat:             s.lat ? Number(s.lat) : undefined,
      lng:             s.lng ? Number(s.lng) : undefined,
      loggedAt:        Number(s.logged_at),
    })),
  };
}

function safeJsonParse(value: string | undefined | null, fallback: any): any {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export class TrailService {
  constructor(private db: KnexSqlUtilities) {}

  async getSessions(username: string): Promise<any[]> {
    const rows = await this.db.find<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, {
      created_by: username, record_status: "A",
    }, { orderBy: "started_at", orderDirection: "desc" });

    const sessionIds = rows.map((r) => r.id!).filter(Boolean);
    const allSplits: ITB_TRAIL_SPLIT[] = sessionIds.length
      ? await this.db.find<ITB_TRAIL_SPLIT>(TB_TRAIL_SPLIT, { record_status: "A" })
          .then((s) => s.filter((sp) => sessionIds.includes(sp.trail_session_id)))
      : [];

    return rows.map((row) => {
      const splits = allSplits.filter((s) => s.trail_session_id === row.id);
      return buildSessionResponse(row, splits, false);
    });
  }

  async getSessionById(sessionId: string, username: string): Promise<any | null> {
    const row = await this.db.findOne<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, {
      session_id: sessionId, created_by: username, record_status: "A",
    });
    if (!row) return null;

    const splits = await this.db.find<ITB_TRAIL_SPLIT>(TB_TRAIL_SPLIT, {
      trail_session_id: row.id, record_status: "A",
    }, { orderBy: "km_mark", orderDirection: "asc" });

    return buildSessionResponse(row, splits, true);
  }

  async createSession(username: string, payload: {
    trailId: string; trailName: string; trailType: string; status: string; startedAt: number;
  }): Promise<any> {
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    await this.db.insert<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, {
      session_id:             sessionId,
      created_by:             username,
      trail_id:               payload.trailId,
      trail_name:             payload.trailName,
      trail_type:             payload.trailType as "preset" | "custom",
      status:                 payload.status as "active" | "paused" | "completed",
      started_at:             payload.startedAt,
      total_km:               0,
      total_steps:            0,
      total_duration_seconds: 0,
      record_status:          "A",
      created_dt:             now,
    });

    const created = await this.db.findOne<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, {
      session_id: sessionId, created_by: username,
    });
    return buildSessionResponse(created!, [], false);
  }

  async completeSession(sessionId: string, username: string, payload: {
    status: string; completedAt?: number; totalKm: number; totalSteps: number;
    totalDurationSeconds: number; checkpointsReached: string[]; splits: any[]; trackPoints: any[];
  }): Promise<any> {
    const existing = await this.db.findOne<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, {
      session_id: sessionId, created_by: username, record_status: "A",
    });
    if (!existing) throw new Error("Session not found");

    await this.db.transaction(async (trx) => {
      await trx(TB_TRAIL_SESSION).where({ id: existing.id }).update({
        status:                 payload.status,
        completed_at:           payload.completedAt ?? Date.now(),
        total_km:               payload.totalKm,
        total_steps:            payload.totalSteps,
        total_duration_seconds: payload.totalDurationSeconds,
        checkpoints_reached:    JSON.stringify(payload.checkpointsReached),
        track_points:           JSON.stringify(payload.trackPoints),
      });

      for (const split of payload.splits) {
        await trx(TB_TRAIL_SPLIT).insert({
          trail_session_id: existing.id,
          km_mark:          Number(split.kmMark),
          duration_seconds: Number(split.durationSeconds),
          steps:            split.steps ? Number(split.steps) : null,
          lat:              split.lat ?? null,
          lng:              split.lng ?? null,
          logged_at:        Number(split.loggedAt ?? Date.now()),
          record_status:    "A",
        });
      }
    });

    return this.getSessionById(sessionId, username);
  }

  async deleteSession(sessionId: string, username: string): Promise<boolean> {
    const existing = await this.db.findOne<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, {
      session_id: sessionId, created_by: username, record_status: "A",
    });
    if (!existing) return false;

    await this.db.update<ITB_TRAIL_SESSION>(TB_TRAIL_SESSION, { id: existing.id }, {
      record_status: "D",
    });
    return true;
  }

  async getCustomTrails(username: string): Promise<any[]> {
    const rows = await this.db.find<ITB_TRAIL_CUSTOM>(TB_TRAIL_CUSTOM, {
      created_by: username, record_status: "A",
    }, { orderBy: "created_dt", orderDirection: "desc" });

    return rows.map((row) => ({
      id:           row.trail_id,
      type:         "custom",
      name:         row.name,
      country:      row.country,
      totalKm:      Number(row.total_km),
      difficulty:   row.difficulty,
      estimatedDays: Number(row.estimated_days),
      description:  row.description ?? undefined,
      checkpoints:  [],
    }));
  }

  async createCustomTrail(username: string, payload: {
    name: string; country: string; totalKm: number;
    difficulty: string; estimatedDays: number; description?: string;
  }): Promise<any> {
    const trailId = crypto.randomUUID();
    const now = Date.now();

    await this.db.insert<ITB_TRAIL_CUSTOM>(TB_TRAIL_CUSTOM, {
      trail_id:      trailId,
      created_by:    username,
      name:          payload.name,
      country:       payload.country,
      total_km:      payload.totalKm,
      difficulty:    payload.difficulty as "easy" | "moderate" | "hard" | "extreme",
      estimated_days: payload.estimatedDays,
      description:   payload.description,
      record_status: "A",
      created_dt:    now,
    });

    return {
      id:           trailId,
      type:         "custom",
      name:         payload.name,
      country:      payload.country,
      totalKm:      payload.totalKm,
      difficulty:   payload.difficulty,
      estimatedDays: payload.estimatedDays,
      description:  payload.description,
      checkpoints:  [],
    };
  }
}
