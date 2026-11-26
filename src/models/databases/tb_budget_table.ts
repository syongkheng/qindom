import type { BudgetTemplate } from "../../budget/Budget.types.js";
import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_BUDGET_TABLE {
  id?: number;
  session_id: string;
  name: string;
  template: BudgetTemplate;
  created_dt: number;
  created_by_id: number;
  record_status: RecordStatus;
}
