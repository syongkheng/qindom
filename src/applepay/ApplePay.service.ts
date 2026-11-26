import crypto from "crypto";
import { ITB_APPLEPAY_TRANSACTION } from "../models/databases/tb_applepay_transaction.js";
import { ITB_APPLEPAY_CARD_LABEL } from "../models/databases/tb_applepay_card_label.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { DEFAULT_CURRENCY } from "../constants/Locale.js";
import {
  ApplePayCardLabelDto,
  ApplePayDeletedDto,
  ApplePayManualTransactionBody,
  ApplePayRestoredDto,
  ApplePaySmsInput,
  ApplePayTransactionDto,
  TransactionSource,
} from "./ApplePay.types.js";

const APPLEPAY_TRANSACTION_TABLE = "tb_applepay_transaction";
const APPLEPAY_CARD_LABEL_TABLE = "tb_applepay_card_label";

type CardLabels = Record<string, string>;

/**
 * Maps a row to the client shape. The uuid is the only public id; bookkeeping columns
 * (record_status, created_by_id, updated_*) are dropped. `cardLabels` is optional so a
 * bare insert response can skip the label lookup.
 */
function toTransactionDto(row: ITB_APPLEPAY_TRANSACTION, cardLabels: CardLabels = {}): ApplePayTransactionDto {
  return {
    id: row.uuid,
    amount: Number(row.amount),
    currency: row.currency ?? DEFAULT_CURRENCY,
    merchant: row.merchant,
    name: row.name ?? null,
    category: row.category ?? undefined,
    // Rows from before the source column default to V1 (ingestion removed Nov 2026; old rows still display).
    source: (row.source as TransactionSource) ?? TransactionSource.V1,
    cardLast4: row.card_last4 ?? null,
    cardLabel: (row.card_last4 && cardLabels[row.card_last4]) || null,
    occurredDt: row.occurred_dt,
    createdDt: row.created_dt!,
  };
}

/**
 * Apple Pay transactions: one table fed by the V2 bank-SMS Shortcut and manual dashboard entry
 * (plus legacy V1 NFC-Shortcut rows, ingestion removed Nov 2026) so the dashboard shows a single feed.
 * Everything is scoped to `created_by_id = userId`.
 */
export class ApplePayService {
  constructor(private readonly db: KnexSqlUtilities) {}

  // ── Ingestion (siri-shortcut/*, API key) ──

  /**
   * V2 bank-SMS automation (the controller parses the SMS). Covers online purchases too,
   * so there's no Apple Pay device `name`. occurred_dt = receipt time (server clock), which
   * avoids parsing whatever date format/locale the SMS or Shortcut uses.
   */
  async recordSmsTransaction(
    userId: number,
    input: ApplePaySmsInput,
    logContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Insert transaction from bank SMS");
    const now = Date.now();
    const row = await this.db.insert<ITB_APPLEPAY_TRANSACTION>(
      APPLEPAY_TRANSACTION_TABLE,
      {
        uuid: crypto.randomUUID(),
        amount: input.amount,
        currency: input.currency,
        merchant: input.merchant,
        card_last4: input.cardLast4,
        source: TransactionSource.V2,
        occurred_dt: now,
        created_dt: now,
        created_by_id: userId,
      },
      event,
    );
    return toTransactionDto(row);
  }

  // ── Dashboard (/applepay, JWT) ──

  async getTransactions(userId: number, logContext?: IRequestLogContext): Promise<ApplePayTransactionDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List Apple Pay transactions");
    const rows = await this.db.find<ITB_APPLEPAY_TRANSACTION>(
      APPLEPAY_TRANSACTION_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      { orderBy: "occurred_dt", orderDirection: "desc" },
      event,
    );
    const cardLabels = await this.getCardLabels(userId, event);
    return rows.map((row) => toTransactionDto(row, cardLabels));
  }

  /** Cash or missed alerts. Unlike V1/V2 the user supplies occurred_dt (usually logged after the fact). */
  async recordManualTransaction(
    userId: number,
    body: ApplePayManualTransactionBody,
    logContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Insert manual transaction");
    const row = await this.db.insert<ITB_APPLEPAY_TRANSACTION>(
      APPLEPAY_TRANSACTION_TABLE,
      {
        uuid: crypto.randomUUID(),
        amount: body.amount,
        currency: body.currency,
        merchant: body.merchant,
        category: body.category,
        source: TransactionSource.MANUAL,
        occurred_dt: body.occurredDt,
        created_dt: Date.now(),
        created_by_id: userId,
      },
      event,
    );
    return toTransactionDto(row);
  }

  /** Soft delete, for duplicates, refunds or mis-parsed SMS rows. */
  async deleteTransaction(userId: number, uuid: string, logContext?: IRequestLogContext): Promise<ApplePayDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete Apple Pay transaction");
    await this.setRecordStatus(userId, uuid, RecordStatus.ACTIVE, RecordStatus.DELETED, event);
    return { id: uuid, deleted: true };
  }

  /** Undo for delete. The dashboard re-inserts its own snapshot, so only an ack is returned. */
  async restoreTransaction(
    userId: number,
    uuid: string,
    logContext?: IRequestLogContext,
  ): Promise<ApplePayRestoredDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Restore Apple Pay transaction");
    await this.setRecordStatus(userId, uuid, RecordStatus.DELETED, RecordStatus.ACTIVE, event);
    return { id: uuid, restored: true };
  }

  async updateCategory(
    userId: number,
    uuid: string,
    category: string | null,
    logContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update transaction category");
    await this.loadOrThrow(userId, uuid, RecordStatus.ACTIVE, event);
    const [updated] = await this.db.update<ITB_APPLEPAY_TRANSACTION>(
      APPLEPAY_TRANSACTION_TABLE,
      { uuid, created_by_id: userId },
      { category, updated_dt: Date.now(), updated_by_id: userId },
      event,
    );
    return toTransactionDto(updated, await this.getCardLabels(userId, event));
  }

  /**
   * Sets, or clears when `label` is null, the user's nickname for a card. Keyed on
   * (user, card_last4) because the bank alert only reports the last digits, so the
   * label applies to every transaction on that card.
   */
  async setCardLabel(
    userId: number,
    cardLast4: string,
    label: string | null,
    logContext?: IRequestLogContext,
  ): Promise<ApplePayCardLabelDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Set card label");
    const key = { created_by_id: userId, card_last4: cardLast4 };
    const existing = await this.db.findOne<ITB_APPLEPAY_CARD_LABEL>(APPLEPAY_CARD_LABEL_TABLE, key, ["id"], event);

    if (!label) {
      if (existing) await this.db.delete<ITB_APPLEPAY_CARD_LABEL>(APPLEPAY_CARD_LABEL_TABLE, key, event);
    } else if (existing) {
      await this.db.update<ITB_APPLEPAY_CARD_LABEL>(
        APPLEPAY_CARD_LABEL_TABLE,
        key,
        { label, updated_dt: Date.now(), updated_by_id: userId },
        event,
      );
    } else {
      await this.db.insert<ITB_APPLEPAY_CARD_LABEL>(
        APPLEPAY_CARD_LABEL_TABLE,
        { ...key, label, created_dt: Date.now() },
        event,
      );
    }
    return { cardLast4, label };
  }

  // ── Helpers ──

  private async getCardLabels(userId: number, event?: IRequestLogEvent): Promise<CardLabels> {
    const rows = await this.db.find<ITB_APPLEPAY_CARD_LABEL>(
      APPLEPAY_CARD_LABEL_TABLE,
      { created_by_id: userId },
      {},
      event,
    );
    return Object.fromEntries(rows.map((row) => [row.card_last4, row.label]));
  }

  private async loadOrThrow(
    userId: number,
    uuid: string,
    status: RecordStatus,
    event?: IRequestLogEvent,
  ): Promise<ITB_APPLEPAY_TRANSACTION> {
    const row = await this.db.findOne<ITB_APPLEPAY_TRANSACTION>(
      APPLEPAY_TRANSACTION_TABLE,
      { uuid, created_by_id: userId, record_status: status },
      ["*"],
      event,
    );
    if (!row) throw new Exceptions.NotFound("Transaction not found");
    return row;
  }

  private async setRecordStatus(
    userId: number,
    uuid: string,
    from: RecordStatus,
    to: RecordStatus,
    event?: IRequestLogEvent,
  ): Promise<void> {
    await this.loadOrThrow(userId, uuid, from, event);
    await this.db.update<ITB_APPLEPAY_TRANSACTION>(
      APPLEPAY_TRANSACTION_TABLE,
      { uuid, created_by_id: userId },
      { record_status: to, updated_dt: Date.now(), updated_by_id: userId },
      event,
    );
  }
}
