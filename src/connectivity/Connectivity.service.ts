import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";

/**
 * Service to handle connectivity checks.
 */
export class ConnectivityService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * Simple JSON message to indicate server status.
   * @returns status, message, and timestamp of server
   */
  async statistics(): Promise<{
    status: string;
    message: string;
    timestamp: string;
    environment: string;
  }> {
    return {
      status: "ok",
      message: "Server is connected",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
    };
  }
}
