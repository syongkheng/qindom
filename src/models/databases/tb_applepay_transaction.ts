import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_APPLEPAY_TRANSACTION {
  id?: number;
  uuid: string; // column is NULL-able, but every insert sets it
  amount: number;
  // ISO 4217 code as reported by the bank alert (e.g. 'SGD', 'CNY'); rows
  // recorded before this column existed default to 'SGD'.
  currency?: string;
  merchant: string;
  // Apple Pay device/payment label — only ever populated by the V1 NFC-tap
  // automation (ingestion removed Nov 2026; old rows keep it); V2 and manual
  // entries have no equivalent field.
  name?: string | null;
  category?: string | null;
  // 'v1' = legacy "When Apple Pay is used" Shortcut (NFC taps only, ingestion
  // removed Nov 2026), 'v2' = bank transaction-alert SMS forwarding (covers
  // online + NFC transactions), 'manual' = dashboard entry.
  source?: string;
  card_last4?: string | null;
  occurred_dt: number;
  record_status?: RecordStatus;
  created_dt?: number;
  created_by_id?: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
