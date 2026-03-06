export interface ITB_AGENDA_ITEM {
  id?: number;
  itinerary_id: number;
  category?: string;
  title: string;
  desc?: string;
  city?: string;
  city_raw?: string; // JSON-encoded string[]
  start_time?: number;
  end_time?: number;
  duration_in_hours?: number;
  unknown_time?: number; // tinyint 0/1
  budget?: number;
  day?: number;
  date?: string;
  created_dt: number;
  record_status: string;
}
