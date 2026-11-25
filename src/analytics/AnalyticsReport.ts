/**
 * Analytics report contract pdca.analytics.report/v1 — the request/response shape the PDCA website's
 * private /insights dashboard sends (frontend: dental-directory app/analytics/contract.ts).
 * Pure functions only (validation, periods, aggregation) so they can be unit-tested without a DB.
 *
 * Request:  { contract, site, timezone, period:{start,end}, compare:"previous_month", metrics[], breakdowns[], limit }
 * Response: { contract, source:"qindom", generatedAt, period, comparePeriod, totals, series, breakdowns }
 *
 * What qindom can measure comes from tb_analytic_event (events sent to POST /analytics/collect):
 *   visitors = distinct properties.visitorId (falls back to session_id) · newVisitors = first seen in period
 *   pageViews = page_view · whatsappClicks/callClicks/emailClicks/directionsClicks = *_click events
 *   formSubmits = generate_lead · rxDownloads = file_download · enquiries = whatsapp+call+email+form
 * Not measurable here (returned as 0 / []): country, searchTerm, listing* (Google Business Profile).
 */

export const REPORT_CONTRACT = "pdca.analytics.report/v1" as const;

export const REPORT_METRICS = [
  "visitors", "newVisitors", "pageViews", "enquiries",
  "whatsappClicks", "callClicks", "emailClicks", "formSubmits",
  "directionsClicks", "rxDownloads",
  "listingViews", "listingCalls", "listingDirections", "listingWebsiteClicks",
] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export const REPORT_BREAKDOWNS = ["day", "source", "page", "device", "country", "searchTerm"] as const;
export type ReportBreakdown = (typeof REPORT_BREAKDOWNS)[number];

/** Report `site` → analytics system key in tb_analytic_system. */
export const REPORT_SITES: Record<string, string> = { "pdcadental.com": "dental-directory" };

export interface Period {
  start: string;
  end: string;
}

export interface ReportRequest {
  contract: typeof REPORT_CONTRACT;
  site: "pdcadental.com";
  timezone: "Asia/Singapore";
  period: Period;
  compare: "previous_month";
  metrics: ReportMetric[];
  breakdowns: ReportBreakdown[];
  limit: number;
}

export interface MetricTotal {
  value: number;
  previous: number;
}

export interface ReportResponse {
  contract: typeof REPORT_CONTRACT;
  source: "qindom";
  generatedAt: string;
  period: Period;
  comparePeriod: Period;
  totals: Partial<Record<ReportMetric, MetricTotal>>;
  series: { date: string; visitors: number; pageViews: number; enquiries: number }[];
  breakdowns: {
    source?: { key: string; visitors: number }[];
    page?: { key: string; pageViews: number }[];
    device?: { key: string; visitors: number }[];
    country?: { key: string; visitors: number }[];
    searchTerm?: { key: string; clicks: number; impressions: number }[];
  };
}

const REQUEST_KEYS = ["contract", "site", "timezone", "period", "compare", "metrics", "breakdowns", "limit"];
const DAY_MS = 864e5;
const SGT_OFFSET_MS = 8 * 3600e3;
const pad = (n: number) => String(n).padStart(2, "0");
const toT = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const toD = (t: number) => new Date(t).toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const span = (a: string, b: string) => Math.round((toT(b) - toT(a)) / DAY_MS) + 1;

function isValidDate(d: unknown): d is string {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && toD(toT(d)) === d;
}

export function dayList(a: string, b: string): string[] {
  const out: string[] = [];
  for (let t = toT(a); t <= toT(b); t += DAY_MS) out.push(toD(t));
  return out;
}

export function isFullMonth(p: Period): boolean {
  return (
    p.start.slice(0, 7) === p.end.slice(0, 7) &&
    p.start.slice(8) === "01" &&
    Number(p.end.slice(8)) === lastDay(Number(p.end.slice(0, 4)), Number(p.end.slice(5, 7)))
  );
}

function back1(d: string): string {
  let y = Number(d.slice(0, 4));
  let m = Number(d.slice(5, 7)) - 1;
  if (m === 0) {
    m = 12;
    y--;
  }
  return `${y}-${pad(m)}-${pad(Math.min(Number(d.slice(8)), lastDay(y, m)))}`;
}

/** compare: "previous_month" — full month → full previous month; otherwise same dates one month earlier (clamped). */
export function comparePeriod(p: Period): Period {
  if (isFullMonth(p)) {
    const s = back1(p.start);
    return { start: s, end: `${s.slice(0, 7)}-${pad(lastDay(Number(s.slice(0, 4)), Number(s.slice(5, 7))))}` };
  }
  return { start: back1(p.start), end: back1(p.end) };
}

/** Same rules and messages as the frontend validator. Returns every problem (empty = valid). */
export function reportRequestProblems(q: unknown): string[] {
  if (!q || typeof q !== "object" || Array.isArray(q)) return ["request must be an object"];
  const r = q as Record<string, unknown>;
  const errs: string[] = [];
  const ks = Object.keys(r);
  REQUEST_KEYS.forEach((k) => {
    if (!ks.includes(k)) errs.push(`missing key: ${k}`);
  });
  ks.forEach((k) => {
    if (!REQUEST_KEYS.includes(k)) errs.push(`unknown key: ${k}`);
  });
  if (r.contract !== REPORT_CONTRACT) errs.push(`contract must be ${REPORT_CONTRACT}`);
  if (r.site !== "pdcadental.com") errs.push("site must be pdcadental.com");
  if (r.timezone !== "Asia/Singapore") errs.push("timezone must be Asia/Singapore");
  const p = r.period as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join(",") !== "end,start") {
    errs.push("period must hold exactly start and end");
  } else if (!isValidDate(p.start) || !isValidDate(p.end)) {
    errs.push("period dates must be YYYY-MM-DD");
  } else if (p.start > p.end) {
    errs.push("period start is after its end");
  } else if (span(p.start, p.end) > 366) {
    errs.push("period is longer than 366 days");
  }
  if (r.compare !== "previous_month") errs.push("compare must be previous_month");
  if (!Array.isArray(r.metrics) || r.metrics.length === 0) {
    errs.push("metrics must be a non-empty list");
  } else {
    r.metrics.forEach((m) => {
      if (!(REPORT_METRICS as readonly unknown[]).includes(m)) errs.push(`unknown metric: ${String(m)}`);
    });
    if (new Set(r.metrics).size !== r.metrics.length) errs.push("a metric is listed twice");
  }
  if (!Array.isArray(r.breakdowns)) {
    errs.push("breakdowns must be a list");
  } else {
    r.breakdowns.forEach((b) => {
      if (!(REPORT_BREAKDOWNS as readonly unknown[]).includes(b)) errs.push(`unknown breakdown: ${String(b)}`);
    });
  }
  if (!Number.isInteger(r.limit) || (r.limit as number) < 1 || (r.limit as number) > 20) {
    errs.push("limit must be a whole number from 1 to 20");
  }
  return errs;
}

/** [from, to) epoch ms for an inclusive Singapore-date period. */
export function periodRangeMs(p: Period): { from: number; to: number } {
  return { from: toT(p.start) - SGT_OFFSET_MS, to: toT(p.end) + DAY_MS - SGT_OFFSET_MS };
}

export const sgDate = (ms: number) => toD(ms + SGT_OFFSET_MS);
export const sgIsoNow = (now = Date.now()) => `${new Date(now + SGT_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;

/* ---------- aggregation ---------- */

export interface EventRow {
  event: string;
  session_id: string;
  properties: string | null;
  page: string | null;
  referrer: string | null;
  screen_size: string | null;
  created_at: number;
}

/** Stable visitor id: properties.visitorId (random, set after consent) or the session id. */
export function visitorOf(row: Pick<EventRow, "properties" | "session_id">): string {
  if (row.properties) {
    try {
      const p = JSON.parse(row.properties) as { visitorId?: unknown };
      if (typeof p.visitorId === "string" && p.visitorId) return p.visitorId;
    } catch {
      // fall through
    }
  }
  return row.session_id;
}

/** Referrer → the same source labels the dashboard's mock data uses. */
export function classifySource(referrer: string | null | undefined, ownHosts: string[] = []): string {
  if (!referrer) return "Direct";
  let host = "";
  let path = "";
  try {
    const u = new URL(referrer);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "Other sites";
  }
  if (ownHosts.includes(host)) return "Direct";
  if (host === "maps.google.com" || host === "maps.app.goo.gl" || (/^google\./.test(host) && path.startsWith("/maps"))) {
    return "Google Maps";
  }
  if (/^google\.[a-z.]+$/.test(host)) return "Google search";
  if (host.endsWith("instagram.com")) return "Instagram";
  if (host.endsWith("facebook.com") || host === "fb.me" || host === "l.facebook.com" || host === "m.facebook.com") return "Facebook";
  if (host.endsWith("linkedin.com") || host === "lnkd.in") return "LinkedIn";
  if (host.endsWith("tiktok.com")) return "TikTok";
  return "Other sites";
}

const DEVICE_BY_SIZE: Record<string, string> = { small: "mobile", medium: "tablet", large: "desktop" };

const EVENT_FOR: Partial<Record<ReportMetric, string>> = {
  pageViews: "page_view",
  whatsappClicks: "whatsapp_click",
  callClicks: "call_click",
  emailClicks: "email_click",
  directionsClicks: "directions_click",
  formSubmits: "generate_lead",
  rxDownloads: "file_download",
};
const ENQUIRY_METRICS: ReportMetric[] = ["whatsappClicks", "callClicks", "emailClicks", "formSubmits"];

function collapse<F extends string>(
  counts: Map<string, number>,
  field: F,
  limit: number,
): ({ key: string } & Record<F, number>)[] {
  let rows = [...counts.entries()]
    .map(([key, n]) => ({ key, [field]: n }) as { key: string } & Record<F, number>)
    .sort((a, b) => b[field] - a[field] || a.key.localeCompare(b.key));
  if (rows.length > limit) {
    const rest = rows.slice(limit - 1).reduce((s, x) => s + x[field], 0);
    rows = rows.slice(0, limit - 1).concat([{ key: "Other", [field]: rest } as { key: string } & Record<F, number>]);
  }
  return rows;
}

function totalsFor(rows: EventRow[], period: Period, firstSeen: Map<string, number>) {
  const { from, to } = periodRangeMs(period);
  const inRange = rows.filter((r) => r.created_at >= from && r.created_at < to);
  const visitors = new Set(inRange.map(visitorOf));
  const counts: Record<ReportMetric, number> = Object.fromEntries(REPORT_METRICS.map((m) => [m, 0])) as Record<
    ReportMetric,
    number
  >;
  counts.visitors = visitors.size;
  counts.newVisitors = [...visitors].filter((v) => (firstSeen.get(v) ?? from) >= from).length;
  for (const [metric, event] of Object.entries(EVENT_FOR) as [ReportMetric, string][]) {
    counts[metric] = inRange.filter((r) => r.event === event).length;
  }
  counts.enquiries = ENQUIRY_METRICS.reduce((s, m) => s + counts[m], 0);
  return { counts, inRange };
}

/**
 * Builds the v1 response from raw events covering both the period and its compare period.
 * `firstSeen` maps visitor id → earliest event time ever (for newVisitors).
 */
export function aggregateReport(
  req: ReportRequest,
  rows: EventRow[],
  firstSeen: Map<string, number>,
  opts: { now?: number; ownHosts?: string[] } = {},
): ReportResponse {
  const cp = comparePeriod(req.period);
  const cur = totalsFor(rows, req.period, firstSeen);
  const prev = totalsFor(rows, cp, firstSeen);

  const totals: Partial<Record<ReportMetric, MetricTotal>> = {};
  for (const m of req.metrics) totals[m] = { value: cur.counts[m], previous: prev.counts[m] };

  const res: ReportResponse = {
    contract: REPORT_CONTRACT,
    source: "qindom",
    generatedAt: sgIsoNow(opts.now),
    period: { start: req.period.start, end: req.period.end },
    comparePeriod: cp,
    totals,
    series: [],
    breakdowns: {},
  };

  const events = cur.inRange;
  if (req.breakdowns.includes("day")) {
    const byDay = new Map<string, EventRow[]>();
    for (const r of events) {
      const d = sgDate(r.created_at);
      (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r);
    }
    res.series = dayList(req.period.start, req.period.end).map((date) => {
      const list = byDay.get(date) ?? [];
      return {
        date,
        visitors: new Set(list.map(visitorOf)).size,
        pageViews: list.filter((r) => r.event === "page_view").length,
        enquiries: list.filter((r) =>
          ["whatsapp_click", "call_click", "email_click", "generate_lead"].includes(r.event),
        ).length,
      };
    });
  }

  // Per visitor: source from their first event in the period, device from their last.
  const chrono = [...events].sort((a, b) => a.created_at - b.created_at);
  const firstOf = new Map<string, EventRow>();
  const lastOf = new Map<string, EventRow>();
  for (const r of chrono) {
    const v = visitorOf(r);
    if (!firstOf.has(v)) firstOf.set(v, r);
    lastOf.set(v, r);
  }
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  if (req.breakdowns.includes("source")) {
    const m = new Map<string, number>();
    for (const r of firstOf.values()) inc(m, classifySource(r.referrer, opts.ownHosts));
    res.breakdowns.source = collapse(m, "visitors", req.limit);
  }
  if (req.breakdowns.includes("page")) {
    const m = new Map<string, number>();
    for (const r of events) {
      if (r.event !== "page_view") continue;
      inc(m, (r.page || "/").replace(/\/+$/, "") || "/");
    }
    res.breakdowns.page = collapse(m, "pageViews", req.limit);
  }
  if (req.breakdowns.includes("device")) {
    const m = new Map<string, number>();
    for (const r of lastOf.values()) inc(m, DEVICE_BY_SIZE[r.screen_size ?? ""] ?? "unknown");
    res.breakdowns.device = collapse(m, "visitors", req.limit);
  }
  if (req.breakdowns.includes("country")) res.breakdowns.country = [];
  if (req.breakdowns.includes("searchTerm")) res.breakdowns.searchTerm = [];
  return res;
}
