export interface ITB_MEAL_LOG {
  id?: number;
  log_date: string;
  meal_type: string;
  planned_name: string;
  notes?: string | null;
  created_by: string;
  created_dt: number;
  record_status: string;
}
