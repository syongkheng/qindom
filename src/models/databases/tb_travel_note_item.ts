export interface ITB_TRAVEL_NOTE_ITEM {
  id?: number;
  itinerary_id: number;
  label: string;
  category?: string;
  url?: string;
  done: number; // tinyint 0/1
  sort_order: number;
  created_dt: number;
  record_status: string;
}
