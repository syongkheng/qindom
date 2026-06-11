import "express";
import { IDecodedTokenUser } from "../../models/IDecodedTokenUser";
import { IRequestLogContext } from "../../models/IRequestLogContext";

declare global {
  namespace Express {
    interface Request {
      user?: IDecodedTokenUser;
      logContext: IRequestLogContext;
    }
  }
}

export {};