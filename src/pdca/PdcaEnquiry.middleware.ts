import { NextFunction, Request, Response } from "express";

/** Field lengths only (booleans kept): what the request log may hold for this form. */
export function loggablePayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === "string" ? `[${value.length} chars]` : typeof value === "boolean" ? value : "[omitted]",
    ]),
  );
}

/**
 * Replaces the request-log payload (captured by RestRequestLogger, which also feeds Telegram alerts)
 * with field lengths, so names, phone numbers and messages never reach the logs. Mounted right after
 * RestRequestLogger for `/pdca` in app.ts.
 */
export function stripPersonalDataFromLog(req: Request, _res: Response, next: NextFunction): void {
  req.logContext.payload = loggablePayload(req.body);
  next();
}
