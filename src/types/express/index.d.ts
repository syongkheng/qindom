import "express";
import { IDecodedTokenUser } from "../../models/IDecodedTokenUser.js";
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