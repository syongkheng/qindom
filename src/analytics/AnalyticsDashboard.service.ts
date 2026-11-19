import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_ANALYTIC_EVENT } from "../models/databases/tb_analytic_event.js";
import { NormalisedEvent, PAGE_VIEW_EVENTS, RegisteredSystem, SCREEN_SIZES, UNKNOWN } from "./AnalyticsContract.js";

const HOUR_MS = 60 * 60 * 1000;
export const MAX_SUMMARY_HOURS = 168;

export interface SummaryBucket {
  key: string;
  label: string;
  views: number;
  sessions: number;
}

export interface AnalyticsSummary {
  system: { key: string; displayName: string; breakpoints: RegisteredSystem["breakpoints"] };
  range: { from: number; to: number; bucket: "hour"; hours: number };
  views: { total: number; uniqueSessions: number; series: { t: number; views: number; sessions: number }[] };
  breakpoints: SummaryBucket[];
  sizes: SummaryBucket[];
  topPages: { page: string; views: number }[];
}

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
): SummaryBucket[] {
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

export class AnalyticsDashboardService {
  constructor(private db: KnexSqlUtilities) {}

  async insert(e: NormalisedEvent, meta: { userId: string; ipAddress: string; userAgent: string }): Promise<void> {
    await this.db.insert<ITB_ANALYTIC_EVENT>("tb_analytic_event", {
      event: e.event,
      properties: JSON.stringify(e.properties ?? {}),
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
    });
  }

  async summary(system: RegisteredSystem, hours: number, now = Date.now()): Promise<AnalyticsSummary> {
    const { from, starts } = hourlyRange(hours, now);
    const events = [...PAGE_VIEW_EVENTS];
    const base = `FROM tb_analytic_event WHERE \`system\` = ? AND event IN (?, ?) AND created_at >= ? AND created_at <= ?`;
    const args = [system.key, ...events, from, now];

    const [seriesRows, totalRows, viewSplitRows, sessionSplitRows, pageRows] = await Promise.all([
      this.db.raw<{ t: number | string; views: number | string; sessions: number | string }[]>(
        `SELECT FLOOR(created_at / ${HOUR_MS}) * ${HOUR_MS} AS t, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
         ${base} GROUP BY t`,
        args,
      ),
      this.db.raw<{ views: number | string; sessions: number | string }[]>(
        `SELECT COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions ${base}`,
        args,
      ),
      this.db.raw<{ bp: string; sz: string; views: number | string }[]>(
        `SELECT COALESCE(screen_breakpoint, '${UNKNOWN}') AS bp, COALESCE(screen_size, '${UNKNOWN}') AS sz, COUNT(*) AS views
         ${base} GROUP BY bp, sz`,
        args,
      ),
      // Each session counted once, by its most recent page view in range.
      this.db.raw<{ bp: string; sz: string; sessions: number | string }[]>(
        `SELECT COALESCE(e.screen_breakpoint, '${UNKNOWN}') AS bp, COALESCE(e.screen_size, '${UNKNOWN}') AS sz, COUNT(*) AS sessions
           FROM tb_analytic_event e
           JOIN (SELECT MAX(id) AS mid ${base} GROUP BY session_id) latest ON latest.mid = e.id
          GROUP BY bp, sz`,
        args,
      ),
      this.db.raw<{ page: string | null; views: number | string }[]>(
        `SELECT page, COUNT(*) AS views ${base} GROUP BY page ORDER BY views DESC LIMIT 10`,
        args,
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
      system: { key: system.key, displayName: system.displayName, breakpoints: system.breakpoints },
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
      topPages: pageRows.map((r) => ({ page: r.page || "/", views: Number(r.views) })),
    };
  }
}
