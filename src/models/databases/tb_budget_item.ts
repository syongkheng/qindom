import type { BudgetItemStatus } from "../../budget/Budget.types.js";
import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_BUDGET_ITEM {
  id?: number;
  uuid: string; // column is NULL-able, but every insert sets it
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
  record_status: RecordStatus;
}
