export type BudgetTemplate = "home_reno" | "wedding" | "travel" | "other";

export interface ITB_BUDGET_TABLE {
  id?: number;
  session_id: string;
  name: string;
  template: BudgetTemplate;
  created_dt: number;
  created_by_id: number;
  record_status: string;
}
