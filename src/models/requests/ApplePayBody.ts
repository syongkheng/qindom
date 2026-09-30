export interface CreateManualTransactionBody {
  amount: number;
  merchant: string;
  occurredDt: number;
  category: string | null;
}
