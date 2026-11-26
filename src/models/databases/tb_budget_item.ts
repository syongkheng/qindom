import type { BudgetItemStatus } from "../../budget/Budget.types.js";
import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_BUDGET_ITEM {
  id?: number;
  uuid: string;
  table_id: number;
  name: string;
  category?: string | null;
  status: BudgetItemStatus;
  // DECIMAL(12,2): mysql2 reads them back as strings.
  budget_amount?: number | string | null;
  actual_amount?: number | string | null;
  notes?: string | null;
  sort_order: number;
  created_dt: number;
  created_by_id: number;
  record_status: RecordStatus;
}
