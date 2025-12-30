export interface  ITB_ANALYTIC_USER_ACTIVITY {
  session_id: string;
  user_id?: string;
  last_seen_at: number;
  ip_address: string;
  user_agent: string;
}