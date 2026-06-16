import { Request } from "express";
import { IDecodedTokenUser } from "../IDecodedTokenUser.js";

export interface RequestWithUserInfo extends Request {
  user?:         IDecodedTokenUser;
  isPublicKey?:  boolean;
}
