export interface CreateManualTransactionBody {
  amount: number;
  currency: string;
  merchant: string;
  occurredDt: number;
  category: string | null;
}
