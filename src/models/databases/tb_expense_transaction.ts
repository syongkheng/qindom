export interface ITB_EXPENSE_TRANSACTION {
  id?: number;
  type: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  notes?: string | null;
  card_id?: number | null;
  created_by: string;
  created_dt: number;
  record_status: string;
}
