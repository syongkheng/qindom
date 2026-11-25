import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ConnectivityDto } from "./Connectivity.types.js";

const SERVER_CONNECTED_MESSAGE = "Server is connected";
const UNKNOWN_ENVIRONMENT = "unknown";
const DB_PING_SQL = "SELECT 1";

/**
 * Health check used by `deploy.sh` after each deploy.
 */
export class ConnectivityService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Confirms the process is up and the DB answers. A failed DB ping throws,
   * so the endpoint returns 500 and the deploy is reported unhealthy.
   */
  async statistics(): Promise<ConnectivityDto> {
    await this.db.raw(DB_PING_SQL);
    return {
      status: "ok",
      message: SERVER_CONNECTED_MESSAGE,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? UNKNOWN_ENVIRONMENT,
      database: "up",
    };
  }
}
