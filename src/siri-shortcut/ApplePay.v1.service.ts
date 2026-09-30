import crypto from "crypto";
import { LogEmoji } from "../constants/LogEmoji.js";
import { ITB_APPLEPAY_TRANSACTION } from "../models/databases/tb_applepay_transaction.js";
import { ITB_APPLEPAY_CARD_LABEL } from "../models/databases/tb_applepay_card_label.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { CreateManualTransactionBody } from "../models/requests/ApplePayBody.js";

const TB_APPLEPAY_TRANSACTION = "tb_applepay_transaction";
const TB_APPLEPAY_CARD_LABEL = "tb_applepay_card_label";

export interface ApplePayTransactionResponse {
  id: string;
  amount: number;
  merchant: string;
  name: string | null;
  category?: string;
  // 'v1' = NFC-tap automation, 'v2' = bank transaction-alert SMS
  // forwarding, 'manual' = entered on the dashboard. cardLast4 is only ever
  // populated by V2.
  source: string;
  cardLast4: string | null;
  // User-assigned nickname for this card_last4 (e.g. "DBS Debit"), shared
  // across every row with the same card_last4 — see tb_applepay_card_label.
  // Null until the user sets one via the dashboard.
  cardLabel: string | null;
  occurredDt: number;
  createdDt: number;
}

// Never expose the auto-increment DB id — uuid (generated at insert, same
// pattern as the budget module's session_id/item uuid) is the only public
// identifier, and this also drops internal-only bookkeeping columns
// (record_status, created_by_id, updated_*) that the dashboard has no use for.
// `labelsByCardLast4` is an optional lookup (built by getCardLabelMap) so
// callers that don't need it — e.g. a bare insert response — can omit it.
function buildTransactionResponse(
  row: ITB_APPLEPAY_TRANSACTION,
  labelsByCardLast4: Record<string, string> = {},
): ApplePayTransactionResponse {
  return {
    id: row.uuid,
    amount: Number(row.amount),
    merchant: row.merchant,
    name: row.name ?? null,
    category: row.category ?? undefined,
    source: row.source ?? "v1",
    cardLast4: row.card_last4 ?? null,
    cardLabel: (row.card_last4 && labelsByCardLast4[row.card_last4]) || null,
    occurredDt: row.occurred_dt,
    createdDt: row.created_dt!,
  };
}

/**
 * Service to handle Apple Pay transaction ingestion from both the V1 iOS
 * Shortcuts automation ("When Apple Pay is used" — NFC taps only, →
 * recordTransaction) and the V2 automation (bank transaction-alert SMS
 * forwarding — covers online + NFC transactions, → recordSmsTransaction),
 * as well as the authenticated web dashboard (list + categorise). Both
 * automations write into the same table so the dashboard shows one combined
 * feed regardless of which one logged a given row.
 */
export class SsApplePayV1Service {
  constructor(private readonly db: KnexSqlUtilities) {}

  private async getCardLabelMap(userId: number, loggingContext?: IRequestLogContext): Promise<Record<string, string>> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Retrieving Apple Pay card labels")
      : undefined;

    const rows = await this.db.find<ITB_APPLEPAY_CARD_LABEL>(
      TB_APPLEPAY_CARD_LABEL,
      { created_by_id: userId },
      {},
      serviceProcessingLoggingEvent,
    );

    return rows.reduce<Record<string, string>>((map, row) => {
      map[row.card_last4] = row.label;
      return map;
    }, {});
  }

  async recordTransaction(
    userId: number,
    amount: number,
    merchant: string,
    name: string,
    loggingContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionResponse> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Inserting Apple Pay transaction")
      : undefined;

    if (!userId) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    // occurred_dt is generated here rather than trusted from the Shortcut —
    // the automation fires right when the transaction happens, so "now" is
    // an accurate stand-in and it sidesteps parsing whatever date format/
    // locale/timezone that specific Shortcuts version happens to send.
    const now = Date.now();
    const insertedRow = await this.db.insert<ITB_APPLEPAY_TRANSACTION>(
      TB_APPLEPAY_TRANSACTION,
      {
        uuid: crypto.randomUUID(),
        amount,
        merchant,
        name,
        occurred_dt: now,
        created_dt: now,
        created_by_id: userId,
      },
      serviceProcessingLoggingEvent,
    );

    return buildTransactionResponse(insertedRow);
  }

  // V2: called by the "forward bank transaction SMS" Shortcuts automation
  // (see ApplePay.v2.controller.ts), which does the raw-SMS parsing and
  // hands this already-extracted amount/merchant/cardLast4. Unlike V1 this
  // covers every transaction the bank alerts on (online purchases included,
  // not just NFC taps), so it has no Apple Pay device `name` to store.
  async recordSmsTransaction(
    userId: number,
    amount: number,
    merchant: string,
    cardLast4: string | null,
    loggingContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionResponse> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Inserting transaction from bank SMS")
      : undefined;

    if (!userId) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    // occurred_dt uses receipt time, same rationale as V1 — the bank sends
    // the alert SMS right after the transaction posts, so "now" is an
    // accurate stand-in without needing to parse the SMS's own date text.
    const now = Date.now();
    const insertedRow = await this.db.insert<ITB_APPLEPAY_TRANSACTION>(
      TB_APPLEPAY_TRANSACTION,
      {
        uuid: crypto.randomUUID(),
        amount,
        merchant,
        source: "v2",
        card_last4: cardLast4,
        occurred_dt: now,
        created_dt: now,
        created_by_id: userId,
      },
      serviceProcessingLoggingEvent,
    );

    return buildTransactionResponse(insertedRow);
  }

  // Dashboard-entered transaction (cash, missed alerts) — unlike V1/V2 the
  // user supplies occurred_dt, since it's usually logged after the fact.
  async recordManualTransaction(
    userId: number,
    body: CreateManualTransactionBody,
    loggingContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionResponse> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Inserting manual transaction")
      : undefined;

    const insertedRow = await this.db.insert<ITB_APPLEPAY_TRANSACTION>(
      TB_APPLEPAY_TRANSACTION,
      {
        uuid: crypto.randomUUID(),
        amount: body.amount,
        merchant: body.merchant,
        category: body.category,
        source: "manual",
        occurred_dt: body.occurredDt,
        created_dt: Date.now(),
        created_by_id: userId,
      },
      serviceProcessingLoggingEvent,
    );

    return buildTransactionResponse(insertedRow);
  }

  async deleteTransaction(
    userId: number,
    transactionUuid: string,
    loggingContext?: IRequestLogContext,
  ): Promise<{ id: string; deleted: true }> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Deleting Apple Pay transaction")
      : undefined;

    const existing = await this.db.findOne<ITB_APPLEPAY_TRANSACTION>(TB_APPLEPAY_TRANSACTION, {
      uuid: transactionUuid,
      created_by_id: userId,
      record_status: "A",
    });
    if (!existing) throw new Exceptions.NotFound();

    await this.db.update<ITB_APPLEPAY_TRANSACTION>(
      TB_APPLEPAY_TRANSACTION,
      { uuid: transactionUuid, created_by_id: userId },
      { record_status: "D", updated_dt: Date.now(), updated_by_id: userId },
      serviceProcessingLoggingEvent,
    );

    return { id: transactionUuid, deleted: true };
  }

  async getTransactions(userId: number, loggingContext?: IRequestLogContext): Promise<ApplePayTransactionResponse[]> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Retrieving Apple Pay transactions")
      : undefined;

    if (!userId) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    const rows = await this.db.find<ITB_APPLEPAY_TRANSACTION>(
      TB_APPLEPAY_TRANSACTION,
      { created_by_id: userId, record_status: "A" },
      { orderBy: "occurred_dt", orderDirection: "desc" },
      serviceProcessingLoggingEvent,
    );

    const labelsByCardLast4 = await this.getCardLabelMap(userId, loggingContext);
    return rows.map((row) => buildTransactionResponse(row, labelsByCardLast4));
  }

  async updateCategory(
    userId: number,
    transactionUuid: string,
    category: string | null,
    loggingContext?: IRequestLogContext,
  ): Promise<ApplePayTransactionResponse> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Updating Apple Pay transaction category")
      : undefined;

    const existing = (await this.db.findOne<ITB_APPLEPAY_TRANSACTION>(TB_APPLEPAY_TRANSACTION, {
      uuid: transactionUuid,
      created_by_id: userId,
      record_status: "A",
    })) as ITB_APPLEPAY_TRANSACTION | undefined;
    if (!existing) throw new Exceptions.NotFound();

    const [updated] = await this.db.update<ITB_APPLEPAY_TRANSACTION>(
      TB_APPLEPAY_TRANSACTION,
      { uuid: transactionUuid },
      { category, updated_dt: Date.now(), updated_by_id: userId },
      serviceProcessingLoggingEvent,
    );

    const labelsByCardLast4 = await this.getCardLabelMap(userId, loggingContext);
    return buildTransactionResponse(updated, labelsByCardLast4);
  }

  // Sets (or clears, when label is null/empty) the user's nickname for a
  // given card_last4. Shared across every transaction row with that
  // card_last4 — there's no per-transaction card identity beyond the last
  // 4 digits the bank alert reports, so the label lives keyed on
  // (user, card_last4) rather than on the transaction itself.
  async setCardLabel(
    userId: number,
    cardLast4: string,
    label: string | null,
    loggingContext?: IRequestLogContext,
  ): Promise<{ cardLast4: string; label: string | null }> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Setting Apple Pay card label")
      : undefined;

    const existing = (await this.db.findOne<ITB_APPLEPAY_CARD_LABEL>(TB_APPLEPAY_CARD_LABEL, {
      created_by_id: userId,
      card_last4: cardLast4,
    })) as ITB_APPLEPAY_CARD_LABEL | undefined;

    if (!label) {
      if (existing) {
        await this.db.delete<ITB_APPLEPAY_CARD_LABEL>(
          TB_APPLEPAY_CARD_LABEL,
          { created_by_id: userId, card_last4: cardLast4 },
          serviceProcessingLoggingEvent,
        );
      }
      return { cardLast4, label: null };
    }

    if (existing) {
      await this.db.update<ITB_APPLEPAY_CARD_LABEL>(
        TB_APPLEPAY_CARD_LABEL,
        { created_by_id: userId, card_last4: cardLast4 },
        { label, updated_dt: Date.now(), updated_by_id: userId },
        serviceProcessingLoggingEvent,
      );
    } else {
      const now = Date.now();
      await this.db.insert<ITB_APPLEPAY_CARD_LABEL>(
        TB_APPLEPAY_CARD_LABEL,
        { card_last4: cardLast4, label, created_dt: now, created_by_id: userId },
        serviceProcessingLoggingEvent,
      );
    }

    return { cardLast4, label };
  }
}
