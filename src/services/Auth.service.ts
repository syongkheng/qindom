import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import bcrypt from "bcrypt";
import { TokenService } from "./Token.service";
import { UnknownException } from "../exceptions/UnknownException";

/**
 * Service to handle Authentications.
 */
export class AuthService {
  private tokenService: TokenService;
  constructor(private db: KnexSqlUtilities) {
    this.tokenService = new TokenService(db);
  }

  /**
   * Checks if username and system exists
   * @param username
   * @param system
   * @returns
   */
  async checkIfUsernameExistsWithinSystem({
    username,
    system,
  }: {
    username: string;
    system: string;
  }): Promise<{ exist: boolean; nextStep: "register" | "login" }> {
    LoggingUtilities.service.debug(
      "AuthService.checkIfUsernameExistsWithinSystem",
      `Finding username: ${username} in system: ${system}`
    );
    const existingRecord = await this.db.find<ITB_AA_USER>(
      "tb_aa_user",
      { username: username, system: system },
      { limit: 1 }
    );

    if (existingRecord.length > 0) {
      LoggingUtilities.service.info(
        "AuthService.checkIfUsernameExistsWithinSystem",
        `Found username: ${username} in system: ${system}`
      );
      return { exist: true, nextStep: "login" };
    }

    LoggingUtilities.service.warn(
      "AuthService.checkIfUsernameExistsWithinSystem",
      `Username: ${username} does not exists within system: ${system}`
    );
    return { exist: false, nextStep: "register" };
  }

  async createNewUser({
    username,
    password,
    system,
    role,
  }: {
    username: string;
    password: string;
    system: string;
    role: string;
  }): Promise<{ token: string }> {
    LoggingUtilities.service.info(
      "AuthService.createNewUser",
      `Creating user: ${username} for system: ${system} with roles: ${role}`
    );

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    try {
      await this.db.insert<ITB_AA_USER>("tb_aa_user", {
        username: username,
        password: hashedPassword,
        system: system,
        role: role,
        username_system: `${username}_${system}`,
        state: "REGISTER",
        created_dt: new Date().getTime(),
        created_by: "SYSTEM",
        record_status: "A",
      });
      LoggingUtilities.service.info(
        "AuthService.createNewUser",
        `Sucessfully created ${username}_${system}`
      );

      return this.login({ username, password, system });
    } catch (error: any) {
      LoggingUtilities.service.error(
        "AuthService.createNewUser",
        `Something went wrong registering ${username} - ${error}`
      );
      return { token: "" };
    }
  }

  async login({
    username,
    password,
    system,
  }: {
    username: string;
    password: string;
    system: string;
  }): Promise<{ token: string }> {
    LoggingUtilities.service.info(
      "AuthService.login",
      `Attempting to login for ${username}_${system}`
    );

    const existingUser = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      username_system: `${username}_${system}`,
    });

    if (!existingUser) {
      LoggingUtilities.service.error(
        "AuthService.login",
        `${username}_${system} could not be found.`
      );
      throw new UnknownException();
    }

    const isValidPassword = await bcrypt.compare(
      password,
      existingUser.password
    );
    LoggingUtilities.service.error(
      "AuthService.login",
      `Password comparison result: ${isValidPassword}`
    );
    if (!isValidPassword) {
      throw new UnknownException();
    }

    const generatedToken = await this.tokenService.generateToken({
      username: existingUser.username,
      system: existingUser.system,
      role: existingUser.role,
      lastLoggedInDt: existingUser.last_logged_in_dt,
    });

    LoggingUtilities.service.info(
      "AuthService.login",
      `Success login for ${username}_${system} with token: ${generatedToken}`
    );

    await this.db.update<ITB_AA_USER>(
      "tb_aa_user",
      {
        username_system: existingUser.username_system,
      },
      {
        token: generatedToken,
        last_logged_in_dt: new Date().getTime(),
        state: "ACTIVE",
      }
    );

    return { token: generatedToken };
  }

  async authenticateToken(
    token: string
  ): Promise<{ username: string; role: string; exist: boolean }> {
    LoggingUtilities.service.info(
      "AuthService.authenticateToken",
      "Checking if token has expired / is valid format / if user exists"
    );
    const decodedToken = await this.tokenService.decodeToken(token);
    const { exist } = await this.checkIfUsernameExistsWithinSystem({
      username: decodedToken.username,
      system: decodedToken.system,
    });
    LoggingUtilities.service.info(
      "AuthService.authenticateToken",
      `Does ${decodedToken.username}_${decodedToken.system} exists - ${exist}`
    );

    return { username: decodedToken.username, role: decodedToken.role, exist };
  }

  async validatePassword(
    username_system: string,
    password: string
  ): Promise<{ isValid: boolean }> {
    LoggingUtilities.service.info(
      "AuthService.validatePassword",
      `Validating password for ${username_system}`
    );

    const existingUser = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      username_system: username_system,
      record_status: "A",
    });

    if (!existingUser) {
      LoggingUtilities.service.error(
        "AuthService.validatePassword",
        `${username_system} could not be found.`
      );
      throw new UnknownException();
    }

    const isValidPassword = await bcrypt.compare(
      password,
      existingUser.password
    );

    LoggingUtilities.service.info(
      "AuthService.validatePassword",
      `Password validation result for ${username_system} - ${isValidPassword}`
    );

    return { isValid: isValidPassword };
  }

  async updatePassword(
    username_system: string,
    newPassword: string
  ): Promise<void> {
    LoggingUtilities.service.info(
      "AuthService.updatePassword",
      `Updating password for ${username_system}`
    );

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.db.update<ITB_AA_USER>(
      "tb_aa_user",
      {
        username_system: username_system,
        record_status: "A",
      },
      {
        password: hashedPassword,
      }
    );

    LoggingUtilities.service.info(
      "AuthService.updatePassword",
      `Successfully updated password for ${username_system}`
    );
  }
}
