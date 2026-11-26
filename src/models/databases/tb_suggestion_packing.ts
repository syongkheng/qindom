import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_SUGGESTION_PACKING {
  id: number;
  trip_type: string;
  label: string;
  label_key: string | null;
  category: string | null;
  record_status: RecordStatus;
  created_dt: number;
}
