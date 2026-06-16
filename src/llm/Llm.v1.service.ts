import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { LlmV1Validator } from "./Llm.v1.validator.js";

/**
 * Service to handle LLM-related operations.
 */
export class LlmServiceV1 {
  private readonly businessValidator: LlmV1Validator;

  constructor(private readonly db: KnexSqlUtilities) {
    this.businessValidator = new LlmV1Validator(db);
  }


  /**
   * Simple JSON message to indicate server status.
   * @returns status, message, and timestamp of server
   */
  async sendMessage(
    message: string,
    model: string,
    loggingContext?: IRequestLogContext,
  ): Promise<{
    content: string;
    cost: string;
  }> {
    const businessLogicValidationLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "VALIDATION", "Business logic")
      : undefined;

    model = await this.businessValidator.allowedModel(model, businessLogicValidationLoggingEvent);
    message = this.businessValidator.passThrough(message, businessLogicValidationLoggingEvent);

    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Calling LLM Provider")
      : undefined;

    return {
      content: `Echo from model ${model}: ${message}`,
      cost: "$0.00",
    };
  }
}
