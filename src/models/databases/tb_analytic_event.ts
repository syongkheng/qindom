export interface ITB_ANALYTIC_EVENT {
  id?: number;
  event: string;
  properties?: string | null; // JSON-encoded Record<string, unknown>
  page?: string | null;
  referrer?: string | null;
  session_id: string;
  user_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  screen_width?: number | null;
  screen_height?: number | null;
  screen_breakpoint?: string | null; // system-specific breakpoint key, or 'unknown'
  screen_size?: string | null; // normalised: 'small' | 'medium' | 'large' | 'unknown'
  system: string;
  created_at: number;
}
