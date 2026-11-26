import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITB_ANALYTIC_USER_ACTIVITY } from "../models/databases/tb_analytic_user_activity.js";
import { AnalyticsHeartbeatBody, AnalyticsRequestMeta } from "./Analytics.types.js";

const ANALYTIC_USER_ACTIVITY_TABLE = "tb_analytic_user_activity";
/** Heartbeats are keyed by session (one row per session, upserted). */
const HEARTBEAT_CONFLICT_COLUMN = "session_id";

/**
 * `POST /analytics/heartbeat` (fndom sends it every 30 s). Request/response shapes are frozen;
 * a write failure stays `entity_creation_failed`.
 */
export class AnalyticsHeartbeatService {
  constructor(private db: KnexSqlUtilities) {}

  /** Upserts the session's last-seen row. `username` is the logged-in user or "Anonymous". */
  async recordHeartbeat(
    body: AnalyticsHeartbeatBody,
    username: string,
    meta: Omit<AnalyticsRequestMeta, "userId">,
    logContext?: IRequestLogContext,
  ): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Record heartbeat", body.system);
    const now = Date.now();
    const seen = { last_seen_at: now, ip_address: meta.ipAddress, user_agent: meta.userAgent, system: body.system };
    try {
      await this.db.upsert<ITB_ANALYTIC_USER_ACTIVITY>(
        ANALYTIC_USER_ACTIVITY_TABLE,
        { session_id: body.sessionId, user_id: username, ...seen },
        HEARTBEAT_CONFLICT_COLUMN,
        { ...seen, ...(username ? { user_id: username } : {}) },
        event,
      );
    } catch (error) {
      LoggingUtilities.service.error("AnalyticsHeartbeatService.recordHeartbeat", toMessage(error));
      throw new Exceptions.EntityCreation("Heartbeat");
    }
  }
}
