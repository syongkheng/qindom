export interface ITB_ANALYTIC_EVENT {
  id?: number;
  event: string;
  properties?: string; // JSON-encoded Record<string, unknown>
  page?: string;
  referrer?: string;
  session_id: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  system: string;
  created_at: number;
}
