export interface ConnectivityDto {
  /** Always `"ok"` on success: `deploy.sh` greps for `"status":"ok"` as its health signal. */
  status: "ok";
  message: string;
  /** ISO 8601 server time. */
  timestamp: string;
  environment: string;
  database: "up";
}
