import crypto from "crypto";
import { LogEmoji } from "../constants/LogEmoji.js";
import { ITB_APPLEPAY_TRANSACTION } from "../models/databases/tb_applepay_transaction.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const TB_APPLEPAY_TRANSACTION = "tb_applepay_transaction";

export interface ApplePayTransactionResponse {
  id: string;
  amount: number;
  merchant: string;
  name: string;
  category?: string;
  occurredDt: number;
  createdDt: number;
}

// Never expose the auto-increment DB id — uuid (generated at insert, same
// pattern as the budget module's session_id/item uuid) is the only public
// identifier, and this also drops internal-only bookkeeping columns
// (record_status, created_by_id, updated_*) that the dashboard has no use for.
function buildTransactionResponse(row: ITB_APPLEPAY_TRANSACTION): ApplePayTransactionResponse {
  return {
    id: row.uuid,
    amount: Number(row.amount),
    merchant: row.merchant,
    name: row.name,
    category: row.category ?? undefined,
    occurredDt: row.occurred_dt,
    createdDt: row.created_dt!,
  };
}

/**
 * Service to handle Apple Pay transaction ingestion from the iOS Shortcuts
 * automation ("When Apple Pay is used" → POST to this endpoint) and the
 * authenticated web dashboard (list + categorise).
 */
export class SsApplePayV1Service {
  constructor(private readonly db: KnexSqlUtilities) {}

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

    return rows.map(buildTransactionResponse);
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

    return buildTransactionResponse(updated);
  }
}
