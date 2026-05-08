import { Request } from "express";
import { IRequestLogContext } from "../IRequestLogContext";

export interface RequestWithLogContext extends Request {
  logContext: IRequestLogContext;
}
