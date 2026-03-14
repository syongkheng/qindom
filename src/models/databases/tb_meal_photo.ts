export interface ITB_MEAL_PHOTO {
  id?: number;
  uuid: string;
  meal_log_id: number;
  name?: string | null;
  mime_type?: string | null;
  size_in_bytes?: number | null;
  blob?: any;
  created_dt: number;
  record_status: string;
}
