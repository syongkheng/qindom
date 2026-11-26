import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_BUDGET_COLLABORATOR {
  id?: number;
  table_id: number;
  user_id: number;
  added_by_id: number;
  created_dt: number;
  record_status: RecordStatus;
}
