import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { toMessage } from "../utils/errorUtils.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITB_ANALYTIC_EVENT } from "../models/databases/tb_analytic_event.js";
import { ITB_ANALYTIC_USER_ACTIVITY } from "../models/databases/tb_analytic_user_activity.js";
import { ANALYTIC_EVENT_TABLE } from "./AnalyticsDashboard.service.js";
import { AnalyticsHeartbeatBody, AnalyticsLegacyEventBody, AnalyticsRequestMeta } from "./Analytics.types.js";

const ANALYTIC_USER_ACTIVITY_TABLE = "tb_analytic_user_activity";
/** Heartbeats are keyed by session (one row per session, upserted). */
const HEARTBEAT_CONFLICT_COLUMN = "session_id";

/**
 * Deprecated ingest (`POST /analytics`, `POST /analytics/heartbeat`), kept so old clients keep working.
 * New code sends contract v1 to `POST /analytics/collect`. Write failures stay `entity_creation_failed`
 * (frozen error behaviour).
 */
export class AnalyticsLegacyService {
  constructor(private db: KnexSqlUtilities) {}

  async recordEvent(
    body: AnalyticsLegacyEventBody,
    meta: AnalyticsRequestMeta,
    logContext?: IRequestLogContext,
  ): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Record legacy analytics event", body.event);
    try {
      await this.db.insert<ITB_ANALYTIC_EVENT>(
        ANALYTIC_EVENT_TABLE,
        {
          event: body.event,
          properties: JSON.stringify(body.properties),
          page: body.page,
          referrer: body.referrer,
          session_id: body.sessionId,
          user_id: meta.userId || undefined,
          ip_address: meta.ipAddress,
          user_agent: meta.userAgent,
          system: body.system,
          created_at: body.timestamp || Date.now(),
        },
        event,
      );
    } catch (error) {
      LoggingUtilities.service.error("AnalyticsLegacyService.recordEvent", toMessage(error));
      throw new Exceptions.EntityCreation("AnalyticEvent");
    }
  }

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
      LoggingUtilities.service.error("AnalyticsLegacyService.recordHeartbeat", toMessage(error));
      throw new Exceptions.EntityCreation("Heartbeat");
    }
  }
}
