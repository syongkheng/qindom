import "express";
import { IDecodedTokenUser } from "../../token/Token.service";
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