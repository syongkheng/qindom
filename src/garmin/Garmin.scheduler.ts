import { schedule } from "node-cron";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { GarminService } from "./Garmin.service.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

const TIMEZONE = "Asia/Singapore";

export function startGarminScheduler(db: KnexSqlUtilities): void {
  const garminService = new GarminService(db);

  // Every 15 minutes — intraday stress / body-battery / heart-rate snapshot.
  schedule(
    "*/15 * * * *",
    () => {
      garminService
        .pollIntraday()
        .catch((err) => LoggingUtilities.service.error("GarminScheduler.pollIntraday", String(err)));
    },
    { timezone: TIMEZONE },
  );

  // Daily at 08:00 — last night's sleep + roll up yesterday's intraday polls
  // into one persisted daily summary row.
  schedule(
    "0 8 * * *",
    () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      garminService
        .computeDailySummary(yesterday)
        .catch((err) => LoggingUtilities.service.error("GarminScheduler.computeDailySummary", String(err)));
    },
    { timezone: TIMEZONE },
  );

  LoggingUtilities.service.info(
    "GarminScheduler",
    "Started — 15-min intraday poll, 08:00 daily summary (Asia/Singapore)",
  );
}
