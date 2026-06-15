export interface ITbLlmApiToken {
  id?: number;
  user_id: number;
  token_prefix: string;
  token_hash: string;
  name?: string | null;
  rate_limit_per_min?: number;
  revoked_at?: number | null;
  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
  record_status?: string;
}
