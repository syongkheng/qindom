export interface ITB_WEDDING_EVENT {
  id?: number;
  title: string;
  date: string;        // VARCHAR 10, YYYY-MM-DD
  category: string;   // venue | catering | attire | ceremony | admin | other
  status: string;     // pending | done
  notes: string | null;
  created_by: string;
  created_dt: number;
  record_status: string;
}
