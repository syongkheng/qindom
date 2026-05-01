export interface ITB_TRAIL_SPLIT {
  id?: number;
  trail_session_id: number;
  km_mark: number;
  duration_seconds: number;
  steps?: number;
  lat?: number;
  lng?: number;
  logged_at: number;
  record_status: string;
}
