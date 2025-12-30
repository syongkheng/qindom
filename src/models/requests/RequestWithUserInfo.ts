import { Request } from "express";
import { IDecodedTokenUser } from "../../token/Token.service";

export interface RequestWithUserInfo extends Request {
  user?: IDecodedTokenUser;
}
