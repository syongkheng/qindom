import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";

export class LlmV1Validator {
  constructor(private readonly db: KnexSqlUtilities) {}

  async allowedModel(model: string, loggingEvent?: IRequestLogEvent): Promise<string> {
    const allowedModels = await this.db.find(
      "tb_llm_model",
      { model_key: model, record_status: "A" },
      { orderBy: "created_dt" },
      loggingEvent,
    );
    if (allowedModels.length > 0) {
      loggingEvent?.children?.push(`Model '${model}' ${LogEmoji.success} `);
      return model;
    }
    loggingEvent?.children?.push(`Model '${model}' ${LogEmoji.error} `);
    throw new InvalidRequestException("model");
  }

  passThrough(content: string, loggingEvent?: IRequestLogEvent): string {
    loggingEvent?.children?.push(`Fwding: '${content}'`);
    return content;
  }
}
