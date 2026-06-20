import { LogEmoji } from "../constants/LogEmoji.js";
import { ITB_BABY_FEEDING_RECORD } from "../models/databases/tb_baby_feeding_record.js";
import { DiaperLoadLevel, ITB_BABY_DIAPER_RECORD } from "../models/databases/tb_baby_diaper_record.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { SsBabyV1Validator } from "./Baby.v1.validator.js";

/**
 * Service to handle baby tracking operations.
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
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Inserting feeding record")
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

  async recordDiaperChange(
    request: {
      changedAt: number;
      hasStool: boolean;
      hasUrine: boolean;
      stoolLoad: DiaperLoadLevel | null;
      urineLoad: DiaperLoadLevel | null;
    },
    loggingContext?: IRequestLogContext,
  ): Promise<ITB_BABY_DIAPER_RECORD> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Recording diaper change")
      : undefined;

    const userIdFromApiKey: number = loggingContext?.metadata?.userId as number;

    if (!userIdFromApiKey) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId from API key ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    const insertedRow = await this.db.insert<ITB_BABY_DIAPER_RECORD>(
      "tb_baby_diaper_record",
      {
        changed_dt: request.changedAt,
        has_stool: request.hasStool,
        has_urine: request.hasUrine,
        stool_load: request.stoolLoad,
        urine_load: request.urineLoad,
        created_dt: Date.now(),
        created_by_id: userIdFromApiKey,
      },
      serviceProcessingLoggingEvent,
    );

    return insertedRow;
  }

  async getDiaperRecords(loggingContext?: IRequestLogContext): Promise<ITB_BABY_DIAPER_RECORD[]> {
    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Retrieving diaper records")
      : undefined;

    const userIdFromApiKey: number = loggingContext?.metadata?.userId as number;

    if (!userIdFromApiKey) {
      serviceProcessingLoggingEvent?.children?.push(`Invalid userId from API key ${LogEmoji.error}`);
      throw new Error("Invalid API key user");
    }

    const records = await this.db.find<ITB_BABY_DIAPER_RECORD>(
      "tb_baby_diaper_record",
      { created_by_id: userIdFromApiKey, record_status: "A" },
      { orderBy: "changed_dt", orderDirection: "desc" },
      serviceProcessingLoggingEvent,
    );

    return records;
  }
}
