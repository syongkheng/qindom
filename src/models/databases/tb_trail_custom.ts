export interface ITB_TRAIL_CUSTOM {
  id?: number;
  trail_id: string;
  created_by: string;
  name: string;
  country: string;
  total_km: number;
  difficulty: "easy" | "moderate" | "hard" | "extreme";
  estimated_days: number;
  description?: string;
  record_status: string;
  created_dt: number;
}
