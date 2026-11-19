import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ITB_ANALYTIC_SYSTEM } from "../models/databases/tb_analytic_system.js";
import { AnalyticsBreakpoint, BreakpointSchema, RegisteredSystem } from "./AnalyticsContract.js";
import { toMessage } from "../utils/errorUtils.js";
import { z } from "zod";

const CACHE_TTL_MS = 60 * 1000;

function parseJsonArray<T>(raw: string, schema: z.ZodType<T>, label: string): T[] {
  try {
    const parsed = z.array(schema).safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch (err) {
    LoggingUtilities.service.error("AnalyticSystemService", `Bad ${label} JSON: ${toMessage(err)}`);
  }
  return [];
}

function toRegistered(row: ITB_ANALYTIC_SYSTEM): RegisteredSystem & { active: boolean } {
  return {
    key: row.system_key,
    displayName: row.display_name,
    breakpoints: parseJsonArray(row.breakpoints, BreakpointSchema, "breakpoints"),
    allowedOrigins: parseJsonArray(row.allowed_origins, z.string(), "allowed_origins"),
    active: row.record_status === "A",
  };
}

/**
 * The analytics whitelist. Active systems = tb_analytic_system rows with record_status 'A'.
 * Ingest reads through a 60s in-memory cache (single PM2 process); admin writes invalidate it.
 */
export class AnalyticSystemService {
  private static cache: { at: number; systems: Map<string, RegisteredSystem & { active: boolean }> } | null = null;

  constructor(private db: KnexSqlUtilities) {}

  private async all(): Promise<Map<string, RegisteredSystem & { active: boolean }>> {
    const c = AnalyticSystemService.cache;
    if (c && Date.now() - c.at < CACHE_TTL_MS) return c.systems;
    const rows = await this.db.find<ITB_ANALYTIC_SYSTEM>("tb_analytic_system", {}, { orderBy: "id" });
    const systems = new Map(rows.map((r) => [r.system_key, toRegistered(r)]));
    AnalyticSystemService.cache = { at: Date.now(), systems };
    return systems;
  }

  static invalidate(): void {
    AnalyticSystemService.cache = null;
  }

  /** Active system by key, or undefined if unknown/disabled. */
  async getActive(key: string): Promise<RegisteredSystem | undefined> {
    const s = (await this.all()).get(key);
    return s?.active ? s : undefined;
  }

  /** All systems (active + disabled) — for the owner admin page. */
  async listAll(): Promise<(RegisteredSystem & { active: boolean })[]> {
    return [...(await this.all()).values()];
  }

  async listActive(): Promise<RegisteredSystem[]> {
    return (await this.listAll()).filter((s) => s.active);
  }

  async upsert(input: {
    key: string;
    displayName: string;
    breakpoints: AnalyticsBreakpoint[];
    allowedOrigins: string[];
    active: boolean;
  }): Promise<void> {
    const now = Date.now();
    const data = {
      display_name: input.displayName,
      breakpoints: JSON.stringify(input.breakpoints),
      allowed_origins: JSON.stringify(input.allowedOrigins),
      record_status: input.active ? "A" : "D",
      updated_dt: now,
    };
    const existing = await this.db.findOne<ITB_ANALYTIC_SYSTEM>("tb_analytic_system", { system_key: input.key }, ["id"]);
    if (existing) {
      await this.db.update<ITB_ANALYTIC_SYSTEM>("tb_analytic_system", { id: existing.id }, data);
    } else {
      await this.db.insert<ITB_ANALYTIC_SYSTEM>("tb_analytic_system", { ...data, system_key: input.key, created_dt: now });
    }
    AnalyticSystemService.invalidate();
  }
}
