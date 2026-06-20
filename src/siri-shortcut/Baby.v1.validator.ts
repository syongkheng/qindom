import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { DiaperLoadLevel } from "../models/databases/tb_baby_diaper_record.js";

export class SsBabyV1Validator {
  static readonly LOAD_LEVELS = ["light", "medium", "heavy"] as const;

  constructor(private readonly db: KnexSqlUtilities) {}

  passThrough(content: string, loggingEvent?: IRequestLogEvent): string {
    loggingEvent?.children?.push(`Fwding: '${content}'`);
    return content;
  }

  /**
   * Pure structural validation for POST /baby/diaper — no DB access needed, so this is
   * static (controller-facing), unlike the instance/business methods above which need `this.db`.
   */
  static validateDiaperChangeRequest(
    body: any,
    event?: IRequestLogEvent,
  ): {
    changedAt: number;
    hasStool: boolean;
    hasUrine: boolean;
    stoolLoad: DiaperLoadLevel | null;
    urineLoad: DiaperLoadLevel | null;
  } {
    const { changedAt, hasStool, hasUrine, stoolLoad, urineLoad } = body ?? {};

    StructuralValidationUtilities.required(changedAt, "changedAt", event);
    StructuralValidationUtilities.number(changedAt, "changedAt", event);

    StructuralValidationUtilities.required(hasStool, "hasStool", event);
    StructuralValidationUtilities.boolean(hasStool, "hasStool", event);

    StructuralValidationUtilities.required(hasUrine, "hasUrine", event);
    StructuralValidationUtilities.boolean(hasUrine, "hasUrine", event);

    StructuralValidationUtilities.requiredOneOfWhen(hasStool, stoolLoad, this.LOAD_LEVELS, "stoolLoad", event);
    StructuralValidationUtilities.requiredOneOfWhen(hasUrine, urineLoad, this.LOAD_LEVELS, "urineLoad", event);

    return {
      changedAt,
      hasStool,
      hasUrine,
      stoolLoad: hasStool ? stoolLoad : null,
      urineLoad: hasUrine ? urineLoad : null,
    };
  }
}
