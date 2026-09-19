export type BudgetItemStatus = "to_buy" | "bought";

export interface ITB_BUDGET_ITEM {
  id?: number;
  uuid: string;
  table_id: number;
  name: string;
  category?: string | null;
  status: BudgetItemStatus;
  budget_amount?: number | null;
  actual_amount?: number | null;
  notes?: string | null;
  sort_order: number;
  created_dt: number;
  created_by_id: number;
  record_status: string;
}
