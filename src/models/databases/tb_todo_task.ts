export interface ITB_TODO_TASK {
  id?: number;
  uuid: string;
  title: string;
  done: number | boolean;
  done_dt?: number | null;
  pinned: number | boolean;
  sort_order: number;
  record_status: string;
  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
