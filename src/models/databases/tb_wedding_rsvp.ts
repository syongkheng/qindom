import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_WEDDING_RSVP {
  id: number;
  pin: string;
  name: string;
  email: string | null;
  contact_number: string | null;
  attending: 0 | 1;
  dietary_restrictions: string | null;
  meal_preference: string | null;
  message: string | null;
  record_status: RecordStatus;
  created_dt: number;
  updated_dt: number;
}
