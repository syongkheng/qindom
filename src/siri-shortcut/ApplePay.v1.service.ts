import { LogEmoji } from "../constants/LogEmoji.js";
import { ITB_APPLEPAY_TRANSACTION } from "../models/databases/tb_applepay_transaction.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";

/**
 * Service to handle Apple Pay transaction ingestion from the iOS Shortcuts
 * automation ("When Apple Pay is used" → POST to this endpoint).
 */
export class SsApplePayV1Service {
  constructor(private readonly db: KnexSqlUtilities) {}

  async recordTransaction(
    amount: number,
    merchant: string,
    name: string,
    timestamp: number,
    loggingContext?: IRequestLogContext,
  ): Promise<ITB_APPLEPAY_TRANSACTION> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Inserting Apple Pay transaction")
      : undefined;

    const userIdFromApiKey: number = loggingContext?.metadata?.userId as number;

    if (!userIdFromApiKey) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId from API key ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    const insertedRow = await this.db.insert<ITB_APPLEPAY_TRANSACTION>(
      "tb_applepay_transaction",
      {
        amount,
        merchant,
        name,
        occurred_dt: timestamp,
        created_dt: Date.now(),
        created_by_id: userIdFromApiKey,
      },
      serviceProcessingLoggingEvent,
    );

    return insertedRow;
  }

  async getTransactions(loggingContext?: IRequestLogContext): Promise<ITB_APPLEPAY_TRANSACTION[]> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Retrieving Apple Pay transactions")
      : undefined;

    const userIdFromApiKey: number = loggingContext?.metadata?.userId as number;

    if (!userIdFromApiKey) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId from API key ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    return this.db.find<ITB_APPLEPAY_TRANSACTION>(
      "tb_applepay_transaction",
      { created_by_id: userIdFromApiKey, record_status: "A" },
      { orderBy: "occurred_dt", orderDirection: "desc" },
      serviceProcessingLoggingEvent,
    );
  }
}
