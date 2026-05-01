export interface ITB_TRAIL_SESSION {
  id?: number;
  session_id: string;
  created_by: string;
  trail_id: string;
  trail_name: string;
  trail_type: "preset" | "custom";
  status: "active" | "paused" | "completed";
  started_at: number;
  completed_at?: number;
  total_km: number;
  total_steps: number;
  total_duration_seconds: number;
  checkpoints_reached?: string; // JSON-encoded string[]
  track_points?: string;        // JSON-encoded {lat,lng,ts}[]
  notes?: string;
  record_status: string;
  created_dt: number;
}
