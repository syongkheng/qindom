import { Request } from "express";
import { IDecodedTokenUser } from "../IDecodedTokenUser";

export interface RequestWithUserInfo extends Request {
  user?:         IDecodedTokenUser;
  isPublicKey?:  boolean;
}
