import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TRAVEL_PACKING_ITEM {
  id?: number;
  itinerary_id: number;
  label: string;
  category?: string | null;
  packed: number; // tinyint 0/1
  quantity?: number | null;
  sort_order: number;
  created_dt: number;
  record_status: RecordStatus;
}
