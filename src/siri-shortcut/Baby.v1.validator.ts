import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";

export class SsBabyV1Validator {
  constructor(private readonly db: KnexSqlUtilities) {}

  passThrough(content: string, loggingEvent?: IRequestLogEvent): string {
    loggingEvent?.children?.push(`Fwding: '${content}'`);
    return content;
  }
}
