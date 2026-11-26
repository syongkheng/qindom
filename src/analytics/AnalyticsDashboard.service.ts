import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITB_ANALYTIC_EVENT } from "../models/databases/tb_analytic_event.js";
import { Time } from "../constants/Time.js";
import { isOriginAllowed, normaliseEvent, PAGE_VIEW_EVENTS, UNKNOWN } from "./AnalyticsContract.js";
import { AnalyticsSystemService, toSystemDto } from "./AnalyticsSystem.service.js";
import {
  AnalyticsCollectBody,
  AnalyticsRequestMeta,
  AnalyticsSummaryBucketDto,
  AnalyticsSummaryDto,
  RegisteredSystem,
  SCREEN_SIZES,
} from "./Analytics.types.js";

export const ANALYTIC_EVENT_TABLE = "tb_analytic_event";
const HOUR_MS = Time.HOUR_MS;
const TOP_PAGES_LIMIT = 10;
/** Page stored as "" (or NULL) is shown as the root. */
const ROOT_PAGE = "/";

type Count = number | string;

/** Zero-filled hourly buckets, oldest first. `from` is the start of the oldest hour. */
export function hourlyRange(hours: number, now = Date.now()): { from: number; starts: number[] } {
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const from = currentHour - (hours - 1) * HOUR_MS;
  return { from, starts: Array.from({ length: hours }, (_, i) => from + i * HOUR_MS) };
}

/**
 * Build ordered buckets: every registry key (in registry order) is present even with 0,
 * followed by any extra keys seen in the data (e.g. 'unknown', or keys removed from the registry).
 */
export function orderBuckets(
  ordered: { key: string; label: string }[],
  views: Map<string, number>,
  sessions: Map<string, number>,
): AnalyticsSummaryBucketDto[] {
  const known = new Set(ordered.map((o) => o.key));
  const extras = [...new Set([...views.keys(), ...sessions.keys()])]
    .filter((k) => !known.has(k))
    .sort((a, b) => (a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : a.localeCompare(b)));
  return [...ordered, ...extras.map((k) => ({ key: k, label: k }))].map((o) => ({
    key: o.key,
    label: o.label,
    views: views.get(o.key) ?? 0,
    sessions: sessions.get(o.key) ?? 0,
  }));
}

/** Ingest for POST /analytics/collect and the hourly dashboard summary, both on tb_analytic_event. */
export class AnalyticsDashboardService {
  constructor(
    private db: KnexSqlUtilities,
    private systems: AnalyticsSystemService,
    private now: () => number = Date.now,
  ) {}

  /** Stores one v1 event. Unknown/disabled system → 400; Origin not in the system's allowlist → 403. */
  async collect(
    body: AnalyticsCollectBody,
    origin: string | undefined,
    meta: AnalyticsRequestMeta,
    logContext?: IRequestLogContext,
  ): Promise<void> {
    const system = await this.systems.getActive(body.system, logContext);
    if (!system) throw new Exceptions.InvalidRequest("system");
    if (!isOriginAllowed(system, origin)) throw new Exceptions.ForbiddenAccess("Origin not allowed for this system");

    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Record analytics event", body.event);
    const e = normaliseEvent(system, body, this.now());
    await this.db.insert<ITB_ANALYTIC_EVENT>(
      ANALYTIC_EVENT_TABLE,
      {
        event: e.event,
        properties: JSON.stringify(e.properties),
        page: e.page,
        referrer: e.referrer,
        session_id: e.sessionId,
        user_id: meta.userId || undefined,
        ip_address: meta.ipAddress,
        user_agent: meta.userAgent,
        screen_width: e.screenWidth,
        screen_height: e.screenHeight,
        screen_breakpoint: e.screenBreakpoint,
        screen_size: e.screenSize,
        system: e.system,
        created_at: e.timestamp,
      },
      event,
    );
  }

  async summary(
    system: RegisteredSystem,
    hours: number,
    logContext?: IRequestLogContext,
  ): Promise<AnalyticsSummaryDto> {
    const event = LoggingUtilities.request.branch(
      logContext,
      "SERVICE",
      "Analytics summary",
      `${system.key} ${hours}h`,
    );
    const now = this.now();
    const { from, starts } = hourlyRange(hours, now);
    const base = `FROM ${ANALYTIC_EVENT_TABLE} WHERE \`system\` = ? AND event IN (?, ?) AND created_at >= ? AND created_at <= ?`;
    const args = [system.key, ...PAGE_VIEW_EVENTS, from, now];

    const [seriesRows, totalRows, viewSplitRows, sessionSplitRows, pageRows] = await Promise.all([
      this.db.raw<{ t: Count; views: Count; sessions: Count }[]>(
        `SELECT FLOOR(created_at / ?) * ? AS t, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
         ${base} GROUP BY t`,
        [HOUR_MS, HOUR_MS, ...args],
        event,
      ),
      this.db.raw<{ views: Count; sessions: Count }[]>(
        `SELECT COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions ${base}`,
        args,
        event,
      ),
      this.db.raw<{ bp: string; sz: string; views: Count }[]>(
        `SELECT COALESCE(screen_breakpoint, ?) AS bp, COALESCE(screen_size, ?) AS sz, COUNT(*) AS views
         ${base} GROUP BY bp, sz`,
        [UNKNOWN, UNKNOWN, ...args],
        event,
      ),
      // Each session counted once, by its most recent page view in range.
      this.db.raw<{ bp: string; sz: string; sessions: Count }[]>(
        `SELECT COALESCE(e.screen_breakpoint, ?) AS bp, COALESCE(e.screen_size, ?) AS sz, COUNT(*) AS sessions
           FROM ${ANALYTIC_EVENT_TABLE} e
           JOIN (SELECT MAX(id) AS mid ${base} GROUP BY session_id) latest ON latest.mid = e.id
          GROUP BY bp, sz`,
        [UNKNOWN, UNKNOWN, ...args],
        event,
      ),
      this.db.raw<{ page: string | null; views: Count }[]>(
        `SELECT page, COUNT(*) AS views ${base} GROUP BY page ORDER BY views DESC LIMIT ?`,
        [...args, TOP_PAGES_LIMIT],
        event,
      ),
    ]);

    const byHour = new Map(seriesRows.map((r) => [Number(r.t), r]));
    const series = starts.map((t) => {
      const r = byHour.get(t);
      return { t, views: Number(r?.views ?? 0), sessions: Number(r?.sessions ?? 0) };
    });

    const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
    const bpViews = new Map<string, number>();
    const szViews = new Map<string, number>();
    for (const r of viewSplitRows) {
      add(bpViews, r.bp, Number(r.views));
      add(szViews, r.sz, Number(r.views));
    }
    const bpSessions = new Map<string, number>();
    const szSessions = new Map<string, number>();
    for (const r of sessionSplitRows) {
      add(bpSessions, r.bp, Number(r.sessions));
      add(szSessions, r.sz, Number(r.sessions));
    }

    return {
      system: toSystemDto(system),
      range: { from, to: now, bucket: "hour", hours },
      views: {
        total: Number(totalRows[0]?.views ?? 0),
        uniqueSessions: Number(totalRows[0]?.sessions ?? 0),
        series,
      },
      breakpoints: orderBuckets(
        system.breakpoints.map((b) => ({ key: b.key, label: b.label })),
        bpViews,
        bpSessions,
      ),
      sizes: orderBuckets(
        SCREEN_SIZES.map((s) => ({ key: s, label: s })),
        szViews,
        szSessions,
      ),
      topPages: pageRows.map((r) => ({ page: r.page || ROOT_PAGE, views: Number(r.views) })),
    };
  }
}
