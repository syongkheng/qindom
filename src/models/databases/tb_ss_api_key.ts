import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_SS_API_KEY {
  id?: number;
  user_id: number;
  api_key_prefix: string;
  api_key_hash: string;
  key_hint?: string | null;
  name?: string | null;
  rate_limit_per_min?: number;
  revoked_at?: number | null;
  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
  record_status?: RecordStatus;
}
