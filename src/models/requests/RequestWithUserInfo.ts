import { Request } from "express";
import { IDecodedTokenUser } from "../../services/Token.service";

export interface RequestWithUserInfo extends Request {
  user?: IDecodedTokenUser;
}
