import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";
import { IRequestLogEvent } from "../models/IRequestLogContext";
import { LogEmoji } from "../constants/LogEmoji";

export class LlmV1Validator {
  static allowedModel(model: string, loggingEvent?: IRequestLogEvent): string {
    const allowedModels = ["claude-opus-4.5"];
    if (allowedModels.includes(model)) {
      loggingEvent?.children?.push(`Model '${model}' ${LogEmoji.success} `);
      return model;
    }
    loggingEvent?.children?.push(`Model '${model}' ${LogEmoji.error} `);
    throw new InvalidRequestException("model");
  }

  static passThrough(content: string, loggingEvent?: IRequestLogEvent): string {
    loggingEvent?.children?.push(`Fwding: '${content}'`);
    return content;
  }
}
