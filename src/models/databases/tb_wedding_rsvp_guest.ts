export interface ITb_wedding_rsvp_guest {
  id: number;
  rsvp_id: number;
  name: string;
  email: string | null;
  contact_number: string | null;
  dietary_restrictions: string | null;
  meal_preference: string | null;
  record_status: "A" | "D";
  created_dt: number;
}
