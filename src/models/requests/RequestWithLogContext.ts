import { Request } from "express";
import { IRequestLogContext } from "../IRequestLogContext.js";

export interface RequestWithLogContext extends Request {
  logContext: IRequestLogContext;
}
