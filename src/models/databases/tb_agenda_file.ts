export interface ITB_AGENDA_FILE {
  id?: number;
  uuid: string;
  short_code?: string;
  agenda_item_id: number;
  name?: string;
  mime_type?: string;
  size_in_bytes?: number;
  blob?: Buffer | string;
  created_dt: number;
  record_status: string;
}
