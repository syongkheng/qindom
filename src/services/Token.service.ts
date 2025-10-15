import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import jwt from "jsonwebtoken";

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
}
