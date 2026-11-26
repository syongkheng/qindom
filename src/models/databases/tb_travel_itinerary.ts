import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TRAVEL_ITINERARY {
  id?: number;
  session_id: string;
  short_code: string;
  idempotency_key?: string | null;
  session_title: string;
  destination?: string | null;
  destination_raw?: string | null; // JSON-encoded string[]
  country?: string | null;
  number_of_pax?: number | null;
  itinerary_date_raw?: string | null; // JSON-encoded string[]
  start_date?: number | null;
  end_date?: number | null;
  unknown_date?: number | null; // tinyint 0/1
  duration_in_days?: number | null;
  challenge?: string | null;
  pax_names?: string | null; // JSON-encoded string[]
  created_dt: number;
  created_by_id: number;
  record_status: RecordStatus;
}
