export interface ITB_APPLEPAY_TRANSACTION {
  id?: number;
  uuid: string;
  amount: number;
  merchant: string;
  name: string;
  category?: string | null;
  occurred_dt: number;
  record_status?: string;
  created_dt?: number;
  created_by_id?: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
