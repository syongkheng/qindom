export interface ITB_HOUSE_LAYOUT {
  id?: number;
  uuid: string;
  name: string;
  data: string;
  item_count: number;
  record_status: string;
  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
