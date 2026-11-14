export interface ITbCameraDevice {
  id?: number;
  uuid: string;
  token_hash: string;
  /** Null until a dashboard user claims the device with its pairing code. */
  user_id?: number | null;
  name: string;
  paired_dt?: number | null;
  last_seen_dt?: number | null;

  record_status?: string;
  created_dt: number;
  updated_dt?: number | null;
}
