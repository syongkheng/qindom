import "express";
import { IDecodedTokenUser } from "../../token/Token.service";

declare global {
  namespace Express {
    interface Request {
      user?: IDecodedTokenUser;
    }
  }
}