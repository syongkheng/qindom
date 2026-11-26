import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_WEDDING_RSVP_GUEST {
  id: number;
  rsvp_id: number;
  name: string;
  email: string | null;
  contact_number: string | null;
  dietary_restrictions: string | null;
  meal_preference: string | null;
  record_status: RecordStatus;
  created_dt: number;
}
