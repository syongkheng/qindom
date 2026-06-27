import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { ITB_ANALYTIC_EVENT } from "../models/databases/tb_analytic_event.js";
import { toMessage } from "../utils/errorUtils.js";

export class AnalyticEventService {
  constructor(private db: KnexSqlUtilities) {}

  async insertEvent({
    event,
    properties,
    page,
    referrer,
    sessionId,
    userId,
    ipAddress,
    userAgent,
    system,
    timestamp,
  }: {
    event: string;
    properties: Record<string, unknown>;
    page: string;
    referrer: string;
    sessionId: string;
    userId: string;
    ipAddress: string;
    userAgent: string;
    system: string;
    timestamp: number;
  }): Promise<void> {
    LoggingUtilities.service.debug(
      "AnalyticEventService.insertEvent",
      `[${system}] ${event} — session:${sessionId}`,
    );

    try {
      await this.db.insert<ITB_ANALYTIC_EVENT>("tb_analytic_event", {
        event,
        properties: JSON.stringify(properties ?? {}),
        page,
        referrer,
        session_id: sessionId,
        user_id: userId || undefined,
        ip_address: ipAddress,
        user_agent: userAgent,
        system,
        created_at: timestamp || Date.now(),
      });
    } catch (error) {
      LoggingUtilities.service.error(
        "AnalyticEventService.insertEvent",
        `Error inserting analytic event: ${toMessage(error)}`,
      );
      throw new Exceptions.EntityCreation("AnalyticEvent");
    }
  }
}
