import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { IDecodedTokenUser } from "../services/Token.service";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";

export const MandatoryTokenFilter = function (
  req: RequestWithUserInfo,
  res: Response,
  next: NextFunction
) {
  const response = new ControllerResponse(res);
  const jwtSecret = process.env.JWT_SECRET;

  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      LoggingUtilities.service.error(
        "TokenFilter",
        "Missing Header - Authorization"
      );
      return response.badRequest("Invalid Header - Authorization");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      LoggingUtilities.service.error(
        "TokenFilter",
        "Invalid Format - Authorization"
      );
      return response.badRequest("Invalid Format - Authorization");
    }

    if (!jwtSecret) {
      LoggingUtilities.service.error("TokenFilter", "No JWT_SECRET found");
      return response.ko("Something went wrong decoding Jwt");
    }

    const decoded = jwt.verify(token, jwtSecret) as IDecodedTokenUser;
    req.user = decoded;

    next();
  } catch (error) {
    LoggingUtilities.service.error("TokenFilter", `Invalid token : ${error}`);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
