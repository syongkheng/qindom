import { LogEmoji } from "../constants/LogEmoji";
import { ITB_BABY_FEEDING_RECORD } from "../models/databases/tb_baby_feeding_record";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { SsBabyV1Validator } from "./Baby.v1.validator";

/**
 * Service to handle LLM-related operations.
 */
export class SsBabyV1Service {
  private readonly businessValidator: SsBabyV1Validator;
  constructor(private readonly db: KnexSqlUtilities) {
    this.businessValidator = new SsBabyV1Validator(db);
  }

  /**
   * Simple JSON message to indicate server status.
   * @returns status, message, and timestamp of server
   */
  async recordFeeding(
    timing: string,
    qty: string,
    loggingContext?: IRequestLogContext,
  ): Promise<{
    echo: Record<string, string>;
  }> {
    const businessLogicValidationLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "VALIDATION", "Business logic")
      : undefined;

    timing = await this.businessValidator.passThrough(timing, businessLogicValidationLoggingEvent);
    qty = this.businessValidator.passThrough(qty, businessLogicValidationLoggingEvent);

    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Calling LLM Provider")
      : undefined;

    const userIdFromApiKey: number = loggingContext?.metadata?.userId as number;

    if (!userIdFromApiKey) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId from API key ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    await this.db.insert<ITB_BABY_FEEDING_RECORD>(
      "tb_baby_feeding_record",
      {
        timing,
        qty,
        created_dt: Date.now(),
        created_by_id: userIdFromApiKey,
      },
      serviceProcessingLoggingEvent,
    );

    return {
      echo: {
        timing,
        qty,
      },
    };
  }

  async getFeedingRecords(loggingContext?: IRequestLogContext): Promise<ITB_BABY_FEEDING_RECORD[]> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Retrieving feeding records")
      : undefined;

    const userIdFromApiKey: number = loggingContext?.metadata?.userId as number;

    if (!userIdFromApiKey) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId from API key ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    const records = await this.db.find<ITB_BABY_FEEDING_RECORD>(
      "tb_baby_feeding_record",
      { created_by_id: userIdFromApiKey, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "desc" },
      serviceProcessingLoggingEvent,
    );

    return records;
  }
}
