export interface ITbMcpApiKey {
  id?: number;
  user_id: number;

  api_key_hash: string;
  key_hint?: string | null;

  name?: string | null;

  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
  record_status?: string;
}
