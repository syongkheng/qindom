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
  screen_width?: number | null;
  screen_height?: number | null;
  screen_breakpoint?: string | null; // system-specific breakpoint key, or 'unknown'
  screen_size?: string | null; // normalised: 'small' | 'medium' | 'large' | 'unknown'
  system: string;
  created_at: number;
}
