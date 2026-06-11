import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

export class DouyinValidator {
  static validateLiveStatusRequest(req: Request): { userId: string } {
    const { userId } = req.query;
    if (!userId || typeof userId !== "string" || !userId.trim()) throw new InvalidRequestException("userId");
    return { userId: userId.trim() };
  }

  static validateRankListRequest(req: Request): { roomId: string; anchorId: string; secAnchorId: string | null } {
    const { roomId, anchorId, secAnchorId } = req.query;
    if (!roomId || typeof roomId !== "string" || !roomId.trim()) throw new InvalidRequestException("roomId");
    if (!anchorId || typeof anchorId !== "string" || !anchorId.trim()) throw new InvalidRequestException("anchorId");
    return {
      roomId: roomId.trim(),
      anchorId: anchorId.trim(),
      secAnchorId: typeof secAnchorId === "string" && secAnchorId.trim() ? secAnchorId.trim() : null,
    };
  }
}
