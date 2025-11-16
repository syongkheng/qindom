import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

const validateLoginRequest = (req: Request) => {
  const { username, password, system, role } = req.body;
  if (!username || typeof username !== "string") {
    throw new InvalidRequestException("username");
  }

  if (!password || typeof password !== "string") {
    throw new InvalidRequestException("password");
  }
  if (!system || typeof system !== "string") {
    throw new InvalidRequestException("system");
  }
};
