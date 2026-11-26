export interface ITB_ANALYTIC_USER_ACTIVITY {
  session_id: string;
  user_id?: string | null;
  last_seen_at: number;
  ip_address: string | null;
  user_agent: string | null;
  system?: string | null;
}
