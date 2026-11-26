import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TRAVEL_ITINERARY_BOOKING {
  id?: number;
  itinerary_id: number;
  category?: string | null;
  item: string;
  location?: string | null;
  link?: string | null;
  payment?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  nights?: number | null;
  price?: number | string | null; // DECIMAL(12,2), read back as a string
  booked?: number | null; // tinyint 0/1
  free_cancellation?: string | null;
  breakfast?: number | null; // tinyint 0/1
  deposit?: string | null;
  pax_breakdown?: string | null; // JSON string
  sort_order?: number | null;
  created_dt: number;
  record_status: RecordStatus;
}
