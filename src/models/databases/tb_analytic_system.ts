export interface ITB_ANALYTIC_SYSTEM {
  id?: number;
  system_key: string;
  display_name: string;
  breakpoints: string; // JSON-encoded AnalyticsBreakpoint[] (ordered smallest → largest)
  allowed_origins: string; // JSON-encoded string[]; empty = no origin check
  record_status: string; // 'A' = active (accepts events), anything else = disabled
  read_key_hash?: string | null; // sha256 hex of the /analytics/report viewer key (null = report disabled)
  created_dt: number;
  updated_dt: number;
}
