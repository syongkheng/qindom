import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities";
import { LlmV1Validator } from "./Llm.v1.validator";

/**
 * Service to handle LLM-related operations.
 */
export class LlmServiceV1 {
  constructor(private db: KnexSqlUtilities) {}

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

    model = LlmV1Validator.allowedModel(model, businessLogicValidationLoggingEvent);
    message = LlmV1Validator.passThrough(message, businessLogicValidationLoggingEvent);

    const serviceProcessingLoggingEvent = loggingContext
      ? LoggingUtilities.request.branch(loggingContext, "SERVICE", "Calling LLM Provider")
      : undefined;

    

    return {
      content: `Echo from model ${model}: ${message}`,
      cost: "$0.00",
    };
  }
}
