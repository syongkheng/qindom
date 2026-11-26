import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_HOUSE_SHARE {
  id?: number;
  token: string;
  name: string;
  data: string;
  item_count: number;
  record_status: RecordStatus;
  created_dt: number;
  created_by_id: number;
}
