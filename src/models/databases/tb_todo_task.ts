import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TODO_TASK {
  id?: number;
  uuid: string;
  title: string;
  done: number | boolean; // TINYINT(1): written as boolean, read back as 0/1
  done_dt?: number | null;
  pinned: number | boolean; // TINYINT(1): written as boolean, read back as 0/1
  sort_order: number;
  record_status: RecordStatus;
  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
