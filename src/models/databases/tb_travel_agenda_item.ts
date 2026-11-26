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
  duration_in_hours?: number | null;
  unknown_time?: number | null; // tinyint 0/1
  budget?: number | null;
  day?: number | null;
  date?: string | null;
  coordinates_lat?: number | null;
  coordinates_lng?: number | null;
  created_dt: number;
  record_status: RecordStatus;
}
