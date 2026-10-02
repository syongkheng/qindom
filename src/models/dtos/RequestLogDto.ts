// Structured view of one rendered request-log entry (see LoggingUtilities
// render() for the text format and RequestLogParser.ts for the parsing).

export interface RequestLogEventDto {
  /** Pipeline stage — from the log's stage markers, or inferred for older entries */
  stage: "middleware" | "controller" | "service";
  /** VALIDATION, AUTH, SQL, SERVICE, ERROR, WARN… */
  type: string;
  message: string;
  isError: boolean;
  /** Child/detail lines in order, e.g. "tb_aa_user.findOne() - 1ms" */
  lines: string[];
  durationMs: number | null;
  /** Trimmed stack frames — only on unhandled exceptions */
  stack: string[];
}

export interface RequestLogEntryDto {
  requestId: string | null;
  timestamp: string;
  method: string;
  path: string;
  ip: string | null;
  /** Raw JSON text as logged (already redacted) */
  payload: string | null;
  events: RequestLogEventDto[];
  statusCode: number | null;
  /** Standard reason phrase, e.g. "Unauthorized" */
  statusText: string | null;
  /** Raw JSON text as logged — success bodies may be summarised/truncated */
  response: string | null;
  durationMs: number | null;
}

export interface RequestLogMatchDto {
  raw: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number | null;
  requestId: string | null;
  /** null if the entry couldn't be parsed — the page falls back to `raw` */
  entry: RequestLogEntryDto | null;
}

export interface RecentRequestLogDto {
  requestId: string | null;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number | null;
}
