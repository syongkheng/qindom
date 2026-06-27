import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { ITB_ANALYTIC_USER_ACTIVITY } from "../models/databases/tb_analytic_user_activity.js";
import { toMessage } from "../utils/errorUtils.js";

export class HeartbeatService {
  constructor(private db: KnexSqlUtilities) {}

  async insertHeartbeatRecord({
    sessionId,
    username,
    ipAddress,
    userAgent,
    system,
  }: {
    sessionId: string;
    username: string;
    ipAddress: string;
    userAgent: string;
    system: string;
  }): Promise<void> {
    LoggingUtilities.service.debug(
      "HeartbeatService.insertHeartbeatRecord",
      `[${system}] ${username} — ${ipAddress}`,
    );

    try {
      await this.db.upsert<ITB_ANALYTIC_USER_ACTIVITY>(
        "tb_analytic_user_activity",
        {
          session_id: sessionId,
          user_id: username,
          last_seen_at: new Date().getTime(),
          ip_address: ipAddress,
          user_agent: userAgent,
          system,
        },
        "session_id",
        {
          last_seen_at: new Date().getTime(),
          ip_address: ipAddress,
          user_agent: userAgent,
          system,
          ...(username ? { user_id: username } : {}),
        },
      );
    } catch (error) {
      LoggingUtilities.service.error(
        "HeartbeatService.insertHeartbeatRecord",
        `Error inserting heartbeat record: ${toMessage(error)}`,
      );
      throw new Exceptions.EntityCreation("Heartbeat");
    }
  }
}
