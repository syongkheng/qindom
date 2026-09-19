export interface ITb_garmin_daily_summary {
  id: number;
  summary_date: string;
  sleep_score: number | null;
  sleep_duration_min: number | null;
  deep_sleep_min: number | null;
  light_sleep_min: number | null;
  rem_sleep_min: number | null;
  awake_min: number | null;
  avg_stress: number | null;
  max_stress: number | null;
  high_stress_minutes: number;
  // Array of { start: number; end: number } (ms epoch) windows — see
  // GarminService.HIGH_STRESS_* constants for the threshold/sustain rule.
  high_stress_windows_json: string | null;
  min_body_battery: number | null;
  resting_hr: number | null;
  created_dt: number;
  updated_dt: number;
  record_status: "A" | "D";
}
