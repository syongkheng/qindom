export interface ITb_suggestion_note {
  id: number;
  country: string;
  title: string;
  url: string;
  category: string | null;
  mandatory: number; // tinyint 0/1
  min_days_before_arrival: number | null;
  max_advance_hours: number | null;
  notes: string | null;
  record_status: "A" | "D";
  created_dt: number;
}
