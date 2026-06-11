export interface ITbTgImage {
  id?: number;
  short_code: string;
  uuid?: string;
  telegram_file_id: string;
  mime_type?: string;
  file_name?: string;
  size_in_bytes?: number;
  created_dt: number;
  record_status: string;
}
