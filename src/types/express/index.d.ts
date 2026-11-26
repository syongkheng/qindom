import "express";
import { IDecodedTokenUser } from "../../token/Token.types.js";
import { IRequestLogContext } from "../../models/IRequestLogContext.js";

declare global {
  namespace Express {
    interface Request {
      user?: IDecodedTokenUser;
      logContext: IRequestLogContext;
    }
  }
}

export {};
