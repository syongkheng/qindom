import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_CAMERA_DEVICE {
  id?: number;
  uuid: string;
  token_hash: string;
  /** Null until a dashboard user claims the device with its pairing code. */
  user_id?: number | null;
  name: string;
  paired_dt?: number | null;
  last_seen_dt?: number | null;
  record_status?: RecordStatus;
  created_dt: number;
  updated_dt?: number | null;
}
