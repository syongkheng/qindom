export interface ITb_suggestion_packing {
  id: number;
  trip_type: string;
  label: string;
  label_key: string | null;
  category: string | null;
  record_status: "A" | "D";
  created_dt: number;
}
