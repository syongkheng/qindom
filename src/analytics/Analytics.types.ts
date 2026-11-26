import type { APP_TIMEZONE } from "../constants/Locale.js";
import type { ResourceGrant } from "../auth/Permission.js";

// Request/response shapes for /analytics. The collect and report contracts are FROZEN: fndom,
// jessikheng and the PDCA website (dental-directory) send/read them verbatim.

// ── Registry (tb_analytic_system) ─────────────────────────────────────────────

/** Normalised screen classes every system's breakpoints map to. */
export const SCREEN_SIZES = ["small", "medium", "large"] as const;
export type ScreenSize = (typeof SCREEN_SIZES)[number];

/** One entry of a system's ordered breakpoints (smallest → largest; `maxWidth: null` = no upper bound). */
export interface AnalyticsBreakpoint {
  key: string;
  label: string;
  maxWidth: number | null;
  size: ScreenSize;
}

/** A registry row as the server uses it (cached by AnalyticsSystemService). */
export interface RegisteredSystem {
  key: string;
  displayName: string;
  breakpoints: AnalyticsBreakpoint[];
  /** Empty = no origin restriction. */
  allowedOrigins: string[];
  active: boolean;
}

/** `GET /analytics/systems`: systems the caller may view. */
export interface AnalyticsSystemDto {
  key: string;
  displayName: string;
  breakpoints: AnalyticsBreakpoint[];
}

/** `GET|POST /analytics/admin/systems` (owner): the full registry incl. disabled systems. */
export interface AnalyticsSystemAdminDto extends AnalyticsSystemDto {
  allowedOrigins: string[];
  active: boolean;
}

/** `POST /analytics/admin/systems`: create or update by `key`. */
export interface AnalyticsSystemBody {
  key: string;
  displayName: string;
  breakpoints: AnalyticsBreakpoint[];
  allowedOrigins: string[];
  active: boolean;
}

/** `GET|POST /analytics/admin/systems/:key/access` and `.../revoke`: the active viewer grants. */
export type AnalyticsGrantDto = ResourceGrant;

/** `POST /analytics/admin/systems/:key/access`. */
export interface AnalyticsGrantBody {
  /** An awense.com (`fnd`) account's username. */
  username: string;
}

/** `POST /analytics/admin/systems/:key/read-key`: the new viewer key, shown once. */
export interface AnalyticsReadKeyDto {
  readKey: string;
}

// ── Ingest: POST /analytics/collect (contract v1, see AnalyticsContract.ts) ───

export interface AnalyticsCollectScreen {
  width: number;
  height: number;
  breakpoint?: string;
  size?: string;
}

export interface AnalyticsCollectBody {
  v: 1;
  system: string;
  event: string;
  sessionId: string;
  timestamp?: number;
  page: string;
  referrer: string;
  screen?: AnalyticsCollectScreen;
  properties: Record<string, unknown>;
}

/** A collect request resolved against its system, ready to store. */
export interface NormalisedEvent {
  system: string;
  event: string;
  sessionId: string;
  timestamp: number;
  page: string;
  referrer: string;
  properties: Record<string, unknown>;
  screenWidth: number | null;
  screenHeight: number | null;
  screenBreakpoint: string;
  screenSize: string;
}

/** Who sent an event (from the request, not the body). */
export interface AnalyticsRequestMeta {
  /** Logged-in username, or "" for visitors. */
  userId: string;
  ipAddress: string;
  userAgent: string;
}

/** Acknowledgement of `/collect` and `/heartbeat`. */
export interface AnalyticsRecordedDto {
  message: string;
}

// ── POST /analytics/heartbeat (frozen) ────────────────────────────────────────

export interface AnalyticsHeartbeatBody {
  sessionId: string;
  system: string;
}

// ── Dashboard: GET /analytics/systems/:key/summary ────────────────────────────

export interface AnalyticsSummaryBucketDto {
  key: string;
  label: string;
  views: number;
  sessions: number;
}

export interface AnalyticsSummaryDto {
  system: AnalyticsSystemDto;
  range: { from: number; to: number; bucket: "hour"; hours: number };
  views: { total: number; uniqueSessions: number; series: { t: number; views: number; sessions: number }[] };
  breakpoints: AnalyticsSummaryBucketDto[];
  sizes: AnalyticsSummaryBucketDto[];
  topPages: { page: string; views: number }[];
}

// ── Report: POST /analytics/report (pdca.analytics.report/v1, see AnalyticsReport.ts) ──

export const REPORT_CONTRACT = "pdca.analytics.report/v1" as const;
export const REPORT_SITE = "pdcadental.com" as const;
export const REPORT_COMPARE = "previous_month" as const;

export const REPORT_METRICS = [
  "visitors",
  "newVisitors",
  "pageViews",
  "enquiries",
  "whatsappClicks",
  "callClicks",
  "emailClicks",
  "formSubmits",
  "directionsClicks",
  "rxDownloads",
  "listingViews",
  "listingCalls",
  "listingDirections",
  "listingWebsiteClicks",
] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export const REPORT_BREAKDOWNS = ["day", "source", "page", "device", "country", "searchTerm"] as const;
export type ReportBreakdown = (typeof REPORT_BREAKDOWNS)[number];

/** Inclusive Singapore dates, `YYYY-MM-DD`. */
export interface ReportPeriod {
  start: string;
  end: string;
}

export interface AnalyticsReportBody {
  contract: typeof REPORT_CONTRACT;
  site: typeof REPORT_SITE;
  timezone: typeof APP_TIMEZONE;
  period: ReportPeriod;
  compare: typeof REPORT_COMPARE;
  metrics: ReportMetric[];
  breakdowns: ReportBreakdown[];
  limit: number;
}

export interface ReportMetricTotal {
  value: number;
  previous: number;
}

export interface AnalyticsReportDto {
  contract: typeof REPORT_CONTRACT;
  source: "qindom";
  generatedAt: string;
  period: ReportPeriod;
  comparePeriod: ReportPeriod;
  totals: Partial<Record<ReportMetric, ReportMetricTotal>>;
  series: { date: string; visitors: number; pageViews: number; enquiries: number }[];
  breakdowns: {
    source?: { key: string; visitors: number }[];
    page?: { key: string; pageViews: number }[];
    device?: { key: string; visitors: number }[];
    country?: { key: string; visitors: number }[];
    searchTerm?: { key: string; clicks: number; impressions: number }[];
  };
}
