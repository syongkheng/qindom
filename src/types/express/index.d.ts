import "express";
import { IDecodedTokenUser } from "../../services/Token.service";

declare global {
  namespace Express {
    interface Request {
      user?: IDecodedTokenUser;
    }
  }
}