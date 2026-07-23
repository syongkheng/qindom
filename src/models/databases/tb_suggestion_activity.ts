export interface ITb_suggestion_activity {
  id: number;
  destination_tag: string;
  title: string;
  category: string | null;
  estimated_hours: number | null;
  description: string | null;
  record_status: "A" | "D";
  created_dt: number;
}
