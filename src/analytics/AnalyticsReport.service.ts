import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITB_ANALYTIC_SYSTEM } from "../models/databases/tb_analytic_system.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { aggregateReport, comparePeriod, EventRow, periodRangeMs, REPORT_SITES, visitorOf } from "./AnalyticsReport.js";
import { isOriginRequiredAndAllowed } from "./AnalyticsContract.js";
import { ANALYTIC_SYSTEM_TABLE, AnalyticsSystemService } from "./AnalyticsSystem.service.js";
import { ANALYTIC_EVENT_TABLE } from "./AnalyticsDashboard.service.js";
import { AnalyticsReadKeyDto, AnalyticsReportBody, AnalyticsReportDto, RegisteredSystem } from "./Analytics.types.js";

const REPORT_EVENTS = [
  "page_view",
  "whatsapp_click",
  "call_click",
  "email_click",
  "directions_click",
  "file_download",
  "generate_lead",
];

const READ_KEY_PREFIX = "rk_";
const READ_KEY_BYTES = 24;
const SHA256_HEX_LENGTH = 64;

/** A new random viewer key (`rk_` + 32 base64url chars). */
export const generateReadKey = () => `${READ_KEY_PREFIX}${crypto.randomBytes(READ_KEY_BYTES).toString("base64url")}`;

/** Timing-safe comparison of a presented read key against the stored sha256 hex hash. */
export function readKeyMatches(presented: string, storedHash: string | null | undefined): boolean {
  if (!presented || !storedHash || storedHash.length !== SHA256_HEX_LENGTH) return false;
  const a = Buffer.from(sha256Hex(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Hostnames (without `www.`) of a system's own origins, so internal navigation counts as "Direct". */
const ownHosts = (system: RegisteredSystem) =>
  system.allowedOrigins.map((o) => new URL(o).hostname.replace(/^www\./, ""));

/**
 * POST /analytics/report — pdca.analytics.report/v1 from tb_analytic_event.
 * Read access is by a per-system viewer key (tb_analytic_system.read_key_hash), not a user login,
 * because the PDCA site has no accounts.
 */
export class AnalyticsReportService {
  private readonly generateKey: () => string;
  private readonly now: () => number;

  constructor(
    private db: KnexSqlUtilities,
    private systems: AnalyticsSystemService,
    options: { generateKey?: () => string; now?: () => number } = {},
  ) {
    this.generateKey = options.generateKey ?? generateReadKey;
    this.now = options.now ?? Date.now;
  }

  /**
   * The system a report request may read. The SAME 403 for an unknown site/system, a missing or
   * disallowed origin and a wrong key, so nothing can be probed.
   */
  async authorise(
    site: string,
    origin: string | undefined,
    presentedKey: string,
    logContext?: IRequestLogContext,
  ): Promise<RegisteredSystem> {
    const systemKey = REPORT_SITES[site];
    const system = systemKey ? await this.systems.getActive(systemKey, logContext) : undefined;
    if (!system || !isOriginRequiredAndAllowed(system, origin)) throw new Exceptions.ForbiddenAccess();

    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Check report read key");
    const row = await this.db.findOne<ITB_ANALYTIC_SYSTEM>(
      ANALYTIC_SYSTEM_TABLE,
      { system_key: system.key, record_status: RecordStatus.ACTIVE },
      ["read_key_hash"],
      event,
    );
    if (!readKeyMatches(presentedKey, row?.read_key_hash)) throw new Exceptions.ForbiddenAccess();
    return system;
  }

  /** Creates a new random read key (returned once) and stores only its hash. The old key stops working. */
  async rotateReadKey(systemKey: string, logContext?: IRequestLogContext): Promise<AnalyticsReadKeyDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Rotate report read key", systemKey);
    const existing = await this.db.findOne<ITB_ANALYTIC_SYSTEM>(
      ANALYTIC_SYSTEM_TABLE,
      { system_key: systemKey },
      ["id"],
      event,
    );
    if (!existing?.id) throw new Exceptions.NotFound();
    const readKey = this.generateKey();
    await this.db.update<ITB_ANALYTIC_SYSTEM>(
      ANALYTIC_SYSTEM_TABLE,
      { id: existing.id },
      { read_key_hash: sha256Hex(readKey), updated_dt: this.now() },
      event,
    );
    return { readKey };
  }

  async report(
    system: RegisteredSystem,
    req: AnalyticsReportBody,
    logContext?: IRequestLogContext,
  ): Promise<AnalyticsReportDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Build analytics report", system.key);
    const cp = comparePeriod(req.period);
    const from = Math.min(periodRangeMs(cp).from, periodRangeMs(req.period).from);
    const to = Math.max(periodRangeMs(cp).to, periodRangeMs(req.period).to);
    const placeholders = REPORT_EVENTS.map(() => "?").join(", ");

    const rows = await this.db.raw<EventRow[]>(
      `SELECT event, session_id, properties, page, referrer, screen_size, created_at
         FROM ${ANALYTIC_EVENT_TABLE}
        WHERE \`system\` = ? AND event IN (${placeholders}) AND created_at >= ? AND created_at < ?`,
      [system.key, ...REPORT_EVENTS, from, to],
      event,
    );
    const normalised = rows.map((r) => ({ ...r, created_at: Number(r.created_at) }));

    // First time each visitor in range was ever seen (for newVisitors).
    const visitors = [...new Set(normalised.map(visitorOf))];
    const firstSeen = new Map<string, number>();
    if (visitors.length) {
      const seen = await this.db.raw<{ vid: string; first_at: number | string }[]>(
        `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.visitorId')), session_id) AS vid, MIN(created_at) AS first_at
           FROM ${ANALYTIC_EVENT_TABLE}
          WHERE \`system\` = ? AND created_at < ?
          GROUP BY vid`,
        [system.key, to],
        event,
      );
      for (const s of seen) firstSeen.set(s.vid, Number(s.first_at));
    }
    if (event) event.detail = `${normalised.length} events`;
    return aggregateReport(req, normalised, firstSeen, { now: this.now(), ownHosts: ownHosts(system) });
  }
}
