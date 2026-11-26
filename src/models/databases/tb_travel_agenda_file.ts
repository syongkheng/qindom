import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TRAVEL_AGENDA_FILE {
  id?: number;
  uuid: string;
  agenda_item_id: number;
  tg_short_code: string;
  name?: string | null;
  mime_type?: string | null;
  size_in_bytes?: number | null;
  created_dt: number;
  record_status: RecordStatus;
}
