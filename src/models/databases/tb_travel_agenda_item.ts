import type { AgendaListType } from "../../itinerary/Itinerary.types.js";
import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TRAVEL_AGENDA_ITEM {
  id?: number;
  itinerary_id: number;
  category?: string | null;
  list_type?: AgendaListType | null; // discriminates Things-to-do vs Places-to-visit
  title: string;
  desc?: string | null;
  city?: string | null;
  city_raw?: string | null; // JSON-encoded string[]
  start_time?: number | null;
  end_time?: number | null;
  duration_in_hours?: number | string | null; // DECIMAL(6,2), read back as a string
  unknown_time?: number | null; // tinyint 0/1
  budget?: number | string | null; // DECIMAL(12,2), read back as a string
  day?: number | null;
  date?: string | null;
  // DECIMAL(11,8), read back as strings.
  coordinates_lat?: number | string | null;
  coordinates_lng?: number | string | null;
  created_dt: number;
  record_status: RecordStatus;
}
