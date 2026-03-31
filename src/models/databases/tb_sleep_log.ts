export interface ITB_SLEEP_LOG {
  id?: number;
  date: string;                       // VARCHAR 10, YYYY-MM-DD
  source: string;                     // VARCHAR 16: garmin | phone | manual
  bedtime?: string | null;            // VARCHAR 5, HH:MM
  wake_time?: string | null;          // VARCHAR 5, HH:MM
  total_sleep_min?: number | null;
  deep_min?: number | null;
  light_min?: number | null;
  rem_min?: number | null;
  awake_min?: number | null;
  deep_pct?: number | null;
  light_pct?: number | null;
  rem_pct?: number | null;
  resting_hr_bpm?: number | null;
  body_battery_change?: number | null;
  avg_spo2_pct?: number | null;
  lowest_spo2_pct?: number | null;
  avg_respiration_brpm?: number | null;
  lowest_respiration_brpm?: number | null;
  notes?: string | null;
  created_by: string;
  created_dt: number;
  record_status: string;
}
