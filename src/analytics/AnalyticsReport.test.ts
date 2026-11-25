import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateReport,
  classifySource,
  comparePeriod,
  EventRow,
  periodRangeMs,
  REPORT_BREAKDOWNS,
  REPORT_CONTRACT,
  REPORT_METRICS,
  ReportRequest,
  reportRequestProblems,
  sgDate,
  visitorOf,
} from "./AnalyticsReport.js";
import { hashReadKey, readKeyMatches } from "./AnalyticsReport.service.js";

const req = (start = "2026-10-01", end = "2026-10-31"): ReportRequest => ({
  contract: REPORT_CONTRACT,
  site: "pdcadental.com",
  timezone: "Asia/Singapore",
  period: { start, end },
  compare: "previous_month",
  metrics: [...REPORT_METRICS],
  breakdowns: [...REPORT_BREAKDOWNS],
  limit: 8,
});

test("accepts the canonical request", () => {
  assert.deepEqual(reportRequestProblems(req()), []);
});

test("rejects every problem at once", () => {
  const bad = { ...req(), metrics: ["visitors", "visitors", "revenue"], range: "x", limit: 2.5 } as Record<string, unknown>;
  delete bad.compare;
  const p = reportRequestProblems(bad);
  for (const msg of [
    "missing key: compare",
    "unknown key: range",
    "unknown metric: revenue",
    "a metric is listed twice",
    "compare must be previous_month",
    "limit must be a whole number from 1 to 20",
  ]) {
    assert.ok(p.includes(msg), msg);
  }
});

test("rejects bad periods", () => {
  assert.ok(reportRequestProblems({ ...req(), period: { start: "2026-02-30", end: "2026-03-01" } }).includes("period dates must be YYYY-MM-DD"));
  assert.ok(reportRequestProblems({ ...req(), period: { start: "2026-10-31", end: "2026-10-01" } }).includes("period start is after its end"));
  assert.ok(reportRequestProblems({ ...req(), period: { start: "2025-01-01", end: "2026-01-02" } }).includes("period is longer than 366 days"));
  for (const limit of [0, 21]) {
    assert.ok(reportRequestProblems({ ...req(), limit }).includes("limit must be a whole number from 1 to 20"));
  }
});

test("comparePeriod follows previous_month", () => {
  assert.deepEqual(comparePeriod({ start: "2026-10-01", end: "2026-10-31" }), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(comparePeriod({ start: "2026-03-01", end: "2026-03-31" }), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(comparePeriod({ start: "2026-11-01", end: "2026-11-24" }), { start: "2026-10-01", end: "2026-10-24" });
  assert.deepEqual(comparePeriod({ start: "2026-01-01", end: "2026-01-31" }), { start: "2025-12-01", end: "2025-12-31" });
});

test("periods are Singapore dates", () => {
  const { from, to } = periodRangeMs({ start: "2026-10-01", end: "2026-10-01" });
  assert.equal(new Date(from).toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(to - from, 864e5);
  assert.equal(sgDate(Date.UTC(2026, 9, 1, 16, 30)), "2026-10-02");
});

test("classifies referrers into dashboard sources", () => {
  assert.equal(classifySource(""), "Direct");
  assert.equal(classifySource("https://www.google.com/"), "Google search");
  assert.equal(classifySource("https://www.google.com.sg/"), "Google search");
  assert.equal(classifySource("https://www.google.com/maps/place/x"), "Google Maps");
  assert.equal(classifySource("https://maps.app.goo.gl/abc"), "Google Maps");
  assert.equal(classifySource("https://l.instagram.com/"), "Instagram");
  assert.equal(classifySource("https://m.facebook.com/"), "Facebook");
  assert.equal(classifySource("https://www.linkedin.com/feed"), "LinkedIn");
  assert.equal(classifySource("https://www.tiktok.com/@x"), "TikTok");
  assert.equal(classifySource("https://example.org/"), "Other sites");
  assert.equal(classifySource("https://pdcadental.com/services", ["pdcadental.com"]), "Direct");
});

test("visitor id prefers properties.visitorId", () => {
  assert.equal(visitorOf({ properties: '{"visitorId":"v1"}', session_id: "s1" }), "v1");
  assert.equal(visitorOf({ properties: "{}", session_id: "s1" }), "s1");
  assert.equal(visitorOf({ properties: "not json", session_id: "s1" }), "s1");
});

test("read keys are compared by hash", () => {
  const h = hashReadKey("rk_secret");
  assert.equal(h.length, 64);
  assert.equal(readKeyMatches("rk_secret", h), true);
  assert.equal(readKeyMatches("rk_other", h), false);
  assert.equal(readKeyMatches("", h), false);
  assert.equal(readKeyMatches("rk_secret", null), false);
});

const at = (date: string, hourSgt = 10) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hourSgt - 8);
const ev = (event: string, vid: string, date: string, extra: Partial<EventRow> = {}): EventRow => ({
  event,
  session_id: `s-${vid}`,
  properties: JSON.stringify({ visitorId: vid }),
  page: "/",
  referrer: "",
  screen_size: "small",
  created_at: at(date),
  ...extra,
});

test("aggregates totals, enquiries, previous period, series and breakdowns", () => {
  const rows: EventRow[] = [
    // September (compare period)
    ev("page_view", "old", "2026-09-10"),
    ev("whatsapp_click", "old", "2026-09-10"),
    // October
    ev("page_view", "old", "2026-10-02", { page: "/services/", referrer: "https://www.google.com/" }),
    ev("page_view", "new1", "2026-10-02", { referrer: "https://www.instagram.com/", screen_size: "large" }),
    ev("page_view", "new1", "2026-10-03", { page: "/contact" }),
    ev("whatsapp_click", "new1", "2026-10-03"),
    ev("call_click", "new1", "2026-10-03"),
    ev("generate_lead", "new2", "2026-10-31", { screen_size: "medium" }),
    ev("file_download", "old", "2026-10-05"),
    ev("directions_click", "old", "2026-10-05"),
    // Late on 31 Oct SGT still counts as October
    ev("page_view", "new2", "2026-10-31", { created_at: at("2026-10-31", 23) }),
  ];
  const firstSeen = new Map([
    ["old", at("2026-09-10")],
    ["new1", at("2026-10-02")],
    ["new2", at("2026-10-31")],
  ]);
  const r = aggregateReport(req(), rows, firstSeen, { now: Date.UTC(2026, 10, 25) });

  assert.equal(r.source, "qindom");
  assert.deepEqual(Object.keys(r.totals).sort(), [...REPORT_METRICS].sort());
  assert.deepEqual(r.totals.visitors, { value: 3, previous: 1 });
  assert.deepEqual(r.totals.newVisitors, { value: 2, previous: 1 });
  assert.deepEqual(r.totals.pageViews, { value: 4, previous: 1 });
  assert.deepEqual(r.totals.whatsappClicks, { value: 1, previous: 1 });
  assert.deepEqual(r.totals.enquiries, { value: 3, previous: 1 });
  assert.equal(r.totals.rxDownloads?.value, 1);
  assert.equal(r.totals.directionsClicks?.value, 1);
  assert.deepEqual(r.totals.listingViews, { value: 0, previous: 0 });

  assert.equal(r.series.length, 31);
  assert.deepEqual(r.series[1], { date: "2026-10-02", visitors: 2, pageViews: 2, enquiries: 0 });
  assert.deepEqual(r.series[30], { date: "2026-10-31", visitors: 1, pageViews: 1, enquiries: 1 });

  const sum = (xs: { [k: string]: unknown }[], f: string) => xs.reduce((s, x) => s + (x[f] as number), 0);
  assert.equal(sum(r.breakdowns.source!, "visitors"), 3);
  assert.equal(sum(r.breakdowns.device!, "visitors"), 3);
  assert.equal(sum(r.breakdowns.page!, "pageViews"), 4);
  assert.ok(r.breakdowns.page!.some((p) => p.key === "/services" && p.pageViews === 1));
  assert.ok(r.breakdowns.source!.some((s) => s.key === "Instagram"));
  assert.deepEqual(r.breakdowns.country, []);
  assert.deepEqual(r.breakdowns.searchTerm, []);
  assert.match(r.generatedAt, /\+08:00$/);
});

test("collapses breakdown tails into Other", () => {
  const rows = ["/", "/a", "/b", "/c"].map((p, i) => ev("page_view", `v${i}`, "2026-10-02", { page: p }));
  const r = aggregateReport({ ...req(), limit: 2 }, rows, new Map());
  assert.equal(r.breakdowns.page!.length, 2);
  assert.equal(r.breakdowns.page![1].key, "Other");
  assert.equal(r.breakdowns.page![1].pageViews, 3);
});
