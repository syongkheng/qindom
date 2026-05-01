export interface ITB_TRAVEL_PACKING_ITEM {
  id?: number;
  itinerary_id: number;
  label: string;
  category?: string;
  packed: number;        // tinyint 0/1
  quantity?: number;
  sort_order: number;
  created_dt: number;
  record_status: string;
}
