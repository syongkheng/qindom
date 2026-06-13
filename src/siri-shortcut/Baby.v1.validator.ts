import { InvalidRequestException } from "../exceptions/InvalidRequestException";
import { IRequestLogEvent } from "../models/IRequestLogContext";
import { LogEmoji } from "../constants/LogEmoji";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";

export class SsBabyV1Validator {
  constructor(private readonly db: KnexSqlUtilities) {}

  passThrough(content: string, loggingEvent?: IRequestLogEvent): string {
    loggingEvent?.children?.push(`Fwding: '${content}'`);
    return content;
  }
}
