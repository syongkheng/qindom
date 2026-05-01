export interface ITB_SCENIC_CHECKLIST {
  id?: number;
  username: string;
  scenic_id: number;
  visited: number;         // TINYINT(1): 1 = visited, 0 = not visited
  created_dt: number;
  updated_dt: number | null;
  record_status: string;   // 'A' | 'D'
}
