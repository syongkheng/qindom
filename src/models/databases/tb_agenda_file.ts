export interface ITB_AGENDA_FILE {
  id?: number;
  uuid: string;
  agenda_item_id: number;
  tg_short_code: string;
  name?: string;
  mime_type?: string;
  size_in_bytes?: number;
  created_dt: number;
  record_status: string;
}
