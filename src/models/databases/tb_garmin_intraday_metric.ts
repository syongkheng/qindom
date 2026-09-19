export interface ITb_garmin_intraday_metric {
  id: number;
  recorded_dt: number;
  stress_score: number | null;
  body_battery: number | null;
  heart_rate: number | null;
  created_dt: number;
  record_status: "A" | "D";
}
