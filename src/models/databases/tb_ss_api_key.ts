export interface ITbSsApiKey {
  id?: number;
  user_id: number;

  api_key_prefix: string;
  api_key_hash: string;

  name?: string;

  rate_limit_per_min?: number;

  revoked_at?: number | null;

  created_dt: number;
  created_by: string;
  updated_dt?: number | null;
  updated_by?: string | null;
  record_status?: string;
}
