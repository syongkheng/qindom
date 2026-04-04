export interface ITB_EXPENSE_CARD {
  id?: number;
  name: string;
  cycle_end_day: number;
  due_day: number;
  color: string;
  cycle_start_date?: string | null;
  due_date?: string | null;
  created_by: string;
  created_dt: number;
  record_status: string;
}
