import { Exceptions } from "../exceptions/AppExceptions";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import jwt from "jsonwebtoken";

export interface IDecodedTokenUser {
  username: string;
  system: string;
  role: string;
  lastLoggedInDt: number;
}

export class TokenService {
  private readonly jwtSecret: string;
  private readonly jwtExpiration = "1y";

  constructor(private db: KnexSqlUtilities) {
    this.jwtSecret = process.env.JWT_SECRET!;

    if (!this.jwtSecret) {
      LoggingUtilities.service.error(
        "TokenService",
        "JWT_SECRET is not set in environment variables"
      );
      throw new Error("JWT_SECRET environment variable not set");
    }
  }

  async generateToken({
    username,
    system,
    role,
    lastLoggedInDt,
  }: {
    username: string;
    system: string;
    role: string;
    lastLoggedInDt: number;
  }): Promise<string> {
    LoggingUtilities.service.info(
      "TokenService.generateToken",
      `Generating token`
    );
    try {
      const token = jwt.sign(
        { username, system, role, lastLoggedInDt },
        this.jwtSecret,
        { expiresIn: this.jwtExpiration }
      );
      LoggingUtilities.service.info(
        "TokenService.generateToken",
        `Token generated - ${token}`
      );
      return token;
    } catch (error: any) {
      LoggingUtilities.service.error(
        "TokenService.generateToken",
        `Something went wrong generating the token: ${error}`
      );
      return "";
    }
  }

  async decodeToken(token: string) {
    LoggingUtilities.service.info(
      "TokenService.decodeToken",
      `Decoding: ${token}`
    );
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as IDecodedTokenUser;
      LoggingUtilities.service.info(
        "TokenService.decodeToken",
        `Decoded: ${JSON.stringify({ ...decoded })}`
      );
      return decoded;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error instanceof jwt.TokenExpiredError) {
          LoggingUtilities.service.error(
            "TokenService.decodeToken",
            `Token has expired.`
          );
          throw new Exceptions.TokenExpired();
        }
        if (error instanceof jwt.JsonWebTokenError) {
          LoggingUtilities.service.error(
            "TokenService.decodeToken",
            `Invalid token format.`
          );
          throw new Exceptions.TokenFormat();
        }
      }
      LoggingUtilities.service.error(
        "TokenService.decodeToken",
        `Something went wrong decoding token.`
      );
      throw new Exceptions.Unknown();
    }
  }
}
