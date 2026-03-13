export interface ITB_ITINERARY {
  id?: number;
  session_id: string;
  short_code: string;
  idempotency_key?: string;
  session_title: string;
  destination?: string;
  destination_raw?: string; // JSON-encoded string[]
  country?: string;
  number_of_pax?: number;
  itinerary_date_raw?: string; // JSON-encoded string[]
  start_date?: number;
  end_date?: number;
  unknown_date?: number; // tinyint 0/1
  duration_in_days?: number;
  challenge?: string;
  pax_names?: string;
  created_dt: number;
  created_by: string;
  record_status: string;
}
