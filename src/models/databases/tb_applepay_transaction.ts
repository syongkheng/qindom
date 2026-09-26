export interface ITB_APPLEPAY_TRANSACTION {
  id?: number;
  uuid: string;
  amount: number;
  merchant: string;
  // Apple Pay device/payment label — only ever populated by the V1 NFC-tap
  // automation; the V2 email-parsing automation has no equivalent field.
  name?: string | null;
  category?: string | null;
  // 'v1' = "When Apple Pay is used" Shortcut (NFC taps only), 'v2' = bank
  // transaction-alert email forwarding (covers online + NFC transactions).
  source?: string;
  card_last4?: string | null;
  occurred_dt: number;
  record_status?: string;
  created_dt?: number;
  created_by_id?: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
