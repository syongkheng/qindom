import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITB_ANALYTIC_SYSTEM } from "../models/databases/tb_analytic_system.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { Time } from "../constants/Time.js";
import { parseStoredBreakpoints, parseStoredOrigins } from "./Analytics.validator.js";
import {
  AnalyticsSystemAdminDto,
  AnalyticsSystemBody,
  AnalyticsSystemDto,
  RegisteredSystem,
} from "./Analytics.types.js";

export const ANALYTIC_SYSTEM_TABLE = "tb_analytic_system";
const CACHE_TTL_MS = Time.MINUTE_MS;
const REGISTRY_COLUMNS = ["system_key", "display_name", "breakpoints", "allowed_origins", "record_status"] as const;

/** A JSON column → its parsed value, or undefined (logged) when it isn't JSON. */
function readJsonColumn(raw: string, column: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    LoggingUtilities.service.error("AnalyticsSystemService", `Bad ${column} JSON: ${toMessage(err)}`);
    return undefined;
  }
}

/** A malformed JSON column reads as an empty list, so one bad row never breaks ingest. */
export function toRegisteredSystem(row: ITB_ANALYTIC_SYSTEM): RegisteredSystem {
  return {
    key: row.system_key,
    displayName: row.display_name,
    breakpoints: parseStoredBreakpoints(readJsonColumn(row.breakpoints, "breakpoints")) ?? [],
    allowedOrigins: parseStoredOrigins(readJsonColumn(row.allowed_origins, "allowed_origins")) ?? [],
    active: row.record_status === RecordStatus.ACTIVE,
  };
}

export const toSystemDto = ({ key, displayName, breakpoints }: RegisteredSystem): AnalyticsSystemDto => ({
  key,
  displayName,
  breakpoints,
});

export const toSystemAdminDto = (system: RegisteredSystem): AnalyticsSystemAdminDto => ({
  ...toSystemDto(system),
  allowedOrigins: system.allowedOrigins,
  active: system.active,
});

/**
 * The analytics whitelist. Active systems = tb_analytic_system rows with record_status 'A'.
 * Reads go through a 60 s in-memory cache (single PM2 process, shared by every instance);
 * writes here and in AnalyticsReportService invalidate it.
 */
export class AnalyticsSystemService {
  private static cache: { at: number; systems: Map<string, RegisteredSystem> } | null = null;

  constructor(private db: KnexSqlUtilities) {}

  static invalidate(): void {
    AnalyticsSystemService.cache = null;
  }

  private async registry(event?: IRequestLogEvent): Promise<Map<string, RegisteredSystem>> {
    const cached = AnalyticsSystemService.cache;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      if (event) event.detail = "cache hit";
      return cached.systems;
    }
    const rows = await this.db.find<ITB_ANALYTIC_SYSTEM>(
      ANALYTIC_SYSTEM_TABLE,
      {},
      { orderBy: "id", columns: REGISTRY_COLUMNS },
      event,
    );
    const systems = new Map(rows.map((r) => [r.system_key, toRegisteredSystem(r)]));
    AnalyticsSystemService.cache = { at: Date.now(), systems };
    if (event) event.detail = "cache miss";
    return systems;
  }

  /** Active system by key, or undefined if unknown/disabled. */
  async getActive(key: string, logContext?: IRequestLogContext): Promise<RegisteredSystem | undefined> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Analytics system lookup");
    const system = (await this.registry(event)).get(key);
    return system?.active ? system : undefined;
  }

  /** Whether a system with this key exists (active or disabled). */
  async exists(key: string, logContext?: IRequestLogContext): Promise<boolean> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Analytics system exists");
    return (await this.registry(event)).has(key);
  }

  /** Active systems in registry (id) order. */
  async listActive(logContext?: IRequestLogContext): Promise<RegisteredSystem[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List active analytics systems");
    return [...(await this.registry(event)).values()].filter((s) => s.active);
  }

  /** Every system incl. disabled ones, for the owner's admin page. */
  async listAdmin(logContext?: IRequestLogContext): Promise<AnalyticsSystemAdminDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List analytics systems");
    return [...(await this.registry(event)).values()].map(toSystemAdminDto);
  }

  /** Creates or updates the system by key; `active: false` disables it (record_status 'D'). */
  async upsert(input: AnalyticsSystemBody, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Save analytics system", input.key);
    const now = Date.now();
    const data = {
      display_name: input.displayName,
      breakpoints: JSON.stringify(input.breakpoints),
      allowed_origins: JSON.stringify(input.allowedOrigins),
      record_status: input.active ? RecordStatus.ACTIVE : RecordStatus.DELETED,
      updated_dt: now,
    };
    const existing = await this.db.findOne<ITB_ANALYTIC_SYSTEM>(
      ANALYTIC_SYSTEM_TABLE,
      { system_key: input.key },
      ["id"],
      event,
    );
    if (existing) {
      await this.db.update<ITB_ANALYTIC_SYSTEM>(ANALYTIC_SYSTEM_TABLE, { id: existing.id }, data, event);
    } else {
      await this.db.insert<ITB_ANALYTIC_SYSTEM>(
        ANALYTIC_SYSTEM_TABLE,
        { ...data, system_key: input.key, created_dt: now },
        event,
      );
    }
    AnalyticsSystemService.invalidate();
  }
}
