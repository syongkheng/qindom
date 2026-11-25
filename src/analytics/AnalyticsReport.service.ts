import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_ANALYTIC_SYSTEM } from "../models/databases/tb_analytic_system.js";
import {
  aggregateReport,
  comparePeriod,
  EventRow,
  periodRangeMs,
  ReportRequest,
  ReportResponse,
  visitorOf,
} from "./AnalyticsReport.js";
import { AnalyticSystemService } from "./AnalyticSystem.service.js";

const REPORT_EVENTS = [
  "page_view",
  "whatsapp_click",
  "call_click",
  "email_click",
  "directions_click",
  "file_download",
  "generate_lead",
];

export const hashReadKey = (key: string) => crypto.createHash("sha256").update(key, "utf8").digest("hex");

/** Timing-safe comparison of a presented read key against the stored sha256 hex hash. */
export function readKeyMatches(presented: string, storedHash: string | null | undefined): boolean {
  if (!presented || !storedHash || storedHash.length !== 64) return false;
  const a = Buffer.from(hashReadKey(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * POST /analytics/report — pdca.analytics.report/v1 from tb_analytic_event.
 * Read access is by a per-system viewer key (tb_analytic_system.read_key_hash), not a user login,
 * because the PDCA site has no accounts.
 */
export class AnalyticsReportService {
  constructor(private db: KnexSqlUtilities) {}

  async readKeyHash(systemKey: string): Promise<string | null> {
    const row = await this.db.findOne<ITB_ANALYTIC_SYSTEM>(
      "tb_analytic_system",
      { system_key: systemKey, record_status: "A" },
      ["read_key_hash"],
    );
    return row?.read_key_hash ?? null;
  }

  /** Creates a new random read key (returned once) and stores only its hash. Old key stops working. */
  async rotateReadKey(systemKey: string): Promise<string | null> {
    const existing = await this.db.findOne<ITB_ANALYTIC_SYSTEM>("tb_analytic_system", { system_key: systemKey }, ["id"]);
    if (!existing?.id) return null;
    const key = `rk_${crypto.randomBytes(24).toString("base64url")}`;
    await this.db.update<ITB_ANALYTIC_SYSTEM>(
      "tb_analytic_system",
      { id: existing.id },
      { read_key_hash: hashReadKey(key), updated_dt: Date.now() },
    );
    AnalyticSystemService.invalidate();
    return key;
  }

  async report(systemKey: string, req: ReportRequest, ownHosts: string[] = [], now = Date.now()): Promise<ReportResponse> {
    const cp = comparePeriod(req.period);
    const from = Math.min(periodRangeMs(cp).from, periodRangeMs(req.period).from);
    const to = Math.max(periodRangeMs(cp).to, periodRangeMs(req.period).to);
    const placeholders = REPORT_EVENTS.map(() => "?").join(", ");

    const rows = await this.db.raw<EventRow[]>(
      `SELECT event, session_id, properties, page, referrer, screen_size, created_at
         FROM tb_analytic_event
        WHERE \`system\` = ? AND event IN (${placeholders}) AND created_at >= ? AND created_at < ?`,
      [systemKey, ...REPORT_EVENTS, from, to],
    );
    const normalised = rows.map((r) => ({ ...r, created_at: Number(r.created_at) }));

    // First time each visitor in range was ever seen (for newVisitors).
    const visitors = [...new Set(normalised.map(visitorOf))];
    const firstSeen = new Map<string, number>();
    if (visitors.length) {
      const seen = await this.db.raw<{ vid: string; first_at: number | string }[]>(
        `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.visitorId')), session_id) AS vid, MIN(created_at) AS first_at
           FROM tb_analytic_event
          WHERE \`system\` = ? AND created_at < ?
          GROUP BY vid`,
        [systemKey, to],
      );
      for (const s of seen) firstSeen.set(s.vid, Number(s.first_at));
    }
    return aggregateReport(req, normalised, firstSeen, { now, ownHosts });
  }
}
