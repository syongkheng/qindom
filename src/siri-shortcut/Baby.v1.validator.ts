import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { DiaperLoadLevel } from "../models/databases/tb_baby_diaper_record.js";

export class SsBabyV1Validator {
  static readonly LOAD_LEVELS = ["light", "medium", "heavy"] as const;

  constructor(private readonly db: KnexSqlUtilities) {}

  passThrough(content: string, loggingEvent?: IRequestLogEvent): string {
    loggingEvent?.children?.push(`Fwding: '${content}'`);
    return content;
  }

  static validateDiaperChangeRequest(
    body: any,
    loggingEvent?: IRequestLogEvent,
  ): {
    changedAt: number;
    hasStool: boolean;
    hasUrine: boolean;
    stoolLoad: DiaperLoadLevel | null;
    urineLoad: DiaperLoadLevel | null;
  } {
    const { changedAt, hasStool, hasUrine, stoolLoad, urineLoad } = body ?? {};

    V.requiredNumber(changedAt, "changedAt", loggingEvent);
    V.requiredBoolean(hasStool, "hasStool", loggingEvent);
    V.requiredBoolean(hasUrine, "hasUrine", loggingEvent);

    V.requiredOneOfWhen(hasStool, stoolLoad, this.LOAD_LEVELS, "stoolLoad", loggingEvent);
    V.requiredOneOfWhen(hasUrine, urineLoad, this.LOAD_LEVELS, "urineLoad", loggingEvent);

    return {
      changedAt,
      hasStool,
      hasUrine,
      stoolLoad: hasStool ? stoolLoad : null,
      urineLoad: hasUrine ? urineLoad : null,
    };
  }
}
