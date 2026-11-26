/** Where a transaction came from. */
export const TransactionSource = {
  /**
   * Legacy "When Apple Pay is used" Shortcut (NFC taps only). Its ingestion route was removed in
   * Nov 2026; kept so existing rows stored with source "v1" still display.
   */
  V1: "v1",
  /** Bank transaction-alert SMS forwarded by a Shortcut (online + NFC). Only source with `cardLast4`. */
  V2: "v2",
  /** Entered on the dashboard (cash, missed alerts). */
  MANUAL: "manual",
} as const;

export type TransactionSource = (typeof TransactionSource)[keyof typeof TransactionSource];

export interface ApplePayTransactionDto {
  /** The row's uuid; the auto-increment id is never exposed. */
  id: string;
  amount: number;
  /** ISO 4217 (e.g. "SGD", "CNY"). Never converted; the dashboard totals per currency. */
  currency: string;
  merchant: string;
  name: string | null;
  category?: string;
  source: TransactionSource;
  cardLast4: string | null;
  /** The user's nickname for `cardLast4` (tb_applepay_card_label), null until set. */
  cardLabel: string | null;
  occurredDt: number;
  createdDt: number;
}

export interface ApplePayDeletedDto {
  id: string;
  deleted: true;
}

export interface ApplePayRestoredDto {
  id: string;
  restored: true;
}

export interface ApplePayCardLabelDto {
  cardLast4: string;
  /** null = label cleared. */
  label: string | null;
}

// ── Request bodies ──

export interface ApplePayManualTransactionBody {
  amount: number;
  currency: string;
  merchant: string;
  occurredDt: number;
  category: string | null;
}

export interface ApplePayCategoryBody {
  /** null clears the category. */
  category: string | null;
}

export interface ApplePayCardLabelBody {
  cardLast4: string;
  /** null clears the label. */
  label: string | null;
}

// ── Service input from the Siri Shortcut ingestion route (siri-shortcut/ApplePay.v2.controller.ts) ──

/** V2 bank-SMS automation, already parsed. */
export interface ApplePaySmsInput {
  amount: number;
  currency: string;
  merchant: string;
  cardLast4: string | null;
}
