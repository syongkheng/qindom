import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities } from "../utils/StructualValidationUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

export class DouyinValidator {
  static validateLiveStatusRequest(
    query: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { userId: string } {
    const { userId } = query;
    StructuralValidationUtilities.required(userId, "userId", event);
    StructuralValidationUtilities.string(userId, "userId", event);
    if (!(userId as string).trim()) {
      event?.children?.push(`'userId' nonEmpty ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'userId' must not be empty");
    }
    event?.children?.push(`'userId' nonEmpty ${LogEmoji.success} `);
    return { userId: (userId as string).trim() };
  }

  static validateRankListRequest(
    query: Record<string, unknown>,
    event?: IRequestLogEvent,
  ): { roomId: string; anchorId: string; secAnchorId: string | null } {
    const { roomId, anchorId, secAnchorId } = query;
    StructuralValidationUtilities.required(roomId, "roomId", event);
    StructuralValidationUtilities.string(roomId, "roomId", event);
    if (!(roomId as string).trim()) {
      event?.children?.push(`'roomId' nonEmpty ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'roomId' must not be empty");
    }
    event?.children?.push(`'roomId' nonEmpty ${LogEmoji.success} `);
    StructuralValidationUtilities.required(anchorId, "anchorId", event);
    StructuralValidationUtilities.string(anchorId, "anchorId", event);
    if (!(anchorId as string).trim()) {
      event?.children?.push(`'anchorId' nonEmpty ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest("'anchorId' must not be empty");
    }
    event?.children?.push(`'anchorId' nonEmpty ${LogEmoji.success} `);
    return {
      roomId: (roomId as string).trim(),
      anchorId: (anchorId as string).trim(),
      secAnchorId: typeof secAnchorId === "string" && secAnchorId.trim() ? secAnchorId.trim() : null,
    };
  }
}
