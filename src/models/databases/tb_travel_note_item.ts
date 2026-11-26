import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TRAVEL_NOTE_ITEM {
  id?: number;
  itinerary_id: number;
  label: string;
  category?: string | null;
  url?: string | null;
  done: number; // tinyint 0/1
  sort_order: number;
  created_dt: number;
  record_status: RecordStatus;
}
