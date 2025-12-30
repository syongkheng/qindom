import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { Exceptions } from "../exceptions/AppExceptions";
import { ITB_ANALYTIC_USER_ACTIVITY } from "../models/databases/tb_analytic_user_activity";

/**
 * Service to handle Authentications.
 */
export class HeartbeatService {
  constructor(private db: KnexSqlUtilities) {}

  async insertHeartbeatRecord({
    sessionId,
    username,
    ipAddress,
    userAgent,
  }: {
    sessionId: string;
    username: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<void> {
    LoggingUtilities.service.debug(
      "HeartbeatService.insertHeartbeatRecord",
      `${username} - ${ipAddress} - ${userAgent}`
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
        },
        "session_id",
        {
          last_seen_at: new Date().getTime(),
          ip_address: ipAddress,
          user_agent: userAgent,
          ...(username ? { user_id: username } : {}),
        }
      );
    } catch (error: any) {
      console.log(error);
      LoggingUtilities.service.error(
        "HeartbeatService.insertHeartbeatRecord",
        `Error inserting heartbeat record: ${error.message}`
      );
      throw new Exceptions.EntityCreation("Heartbeat");
    }
  }
}
