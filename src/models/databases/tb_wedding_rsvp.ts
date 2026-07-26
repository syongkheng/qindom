export interface ITb_wedding_rsvp {
  id: number;
  name: string;
  email: string | null;
  contact_number: string | null;
  attending: 0 | 1;
  dietary_restrictions: string | null;
  meal_preference: string | null;
  message: string | null;
  record_status: "A" | "D";
  created_dt: number;
}
