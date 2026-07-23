import { InvalidRequestException } from "../exceptions/InvalidRequestException.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";

export class DouyinValidator {
  static validateLiveStatusRequest(
    query: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { userId: string } {
    const { userId } = query;
    V.requiredString(userId, "userId", loggingEvent);
    if (!(userId as string).trim()) {
      loggingEvent?.children?.push(`'userId' nonEmpty ${LogEmoji.error} `);
      throw new InvalidRequestException("userId", "format");
    }
    loggingEvent?.children?.push(`'userId' nonEmpty ${LogEmoji.success} `);
    return { userId: (userId as string).trim() };
  }

  static validateRankListRequest(
    query: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { roomId: string; anchorId: string; secAnchorId: string | null } {
    const { roomId, anchorId, secAnchorId } = query;
    V.requiredString(roomId, "roomId", loggingEvent);
    if (!(roomId as string).trim()) {
      loggingEvent?.children?.push(`'roomId' nonEmpty ${LogEmoji.error} `);
      throw new InvalidRequestException("roomId", "format");
    }
    loggingEvent?.children?.push(`'roomId' nonEmpty ${LogEmoji.success} `);
    V.requiredString(anchorId, "anchorId", loggingEvent);
    if (!(anchorId as string).trim()) {
      loggingEvent?.children?.push(`'anchorId' nonEmpty ${LogEmoji.error} `);
      throw new InvalidRequestException("anchorId", "format");
    }
    loggingEvent?.children?.push(`'anchorId' nonEmpty ${LogEmoji.success} `);
    return {
      roomId: (roomId as string).trim(),
      anchorId: (anchorId as string).trim(),
      secAnchorId: typeof secAnchorId === "string" && secAnchorId.trim() ? secAnchorId.trim() : null,
    };
  }
}
