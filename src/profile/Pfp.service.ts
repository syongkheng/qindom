import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { signToken } from "../token/Token.service.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";

export class PfpService {
  constructor(private db: KnexSqlUtilities) {}

  async getCountry(username_system: string): Promise<{ country: string | null }> {
    try {
      const userRecord = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
        username_system,
        record_status: "A",
      });
      return { country: userRecord?.country || null };
    } catch (error) {
      throw new Exceptions.Unknown();
    }
  }

  async updateCountry(username_system: string, country: string): Promise<ITB_AA_USER[]> {
    try {
      const updatedUser = await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { username_system, record_status: "A" },
        { country },
      );
      return updatedUser.map(({ record_status, created_dt, ...user }: any) => ({
        ...user,
        password: "[REDACTED]",
        token: "[REDACTED]",
      }));
    } catch (error) {
      throw new Exceptions.Unknown();
    }
  }

  async updateProfilePhoto(username_system: string, photoUrl: string): Promise<ITB_AA_USER[]> {
    try {
      const updatedUser = await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { username_system, record_status: "A" },
        { pfp_picture_blob: photoUrl },
      );
      return updatedUser.map(({ record_status, created_dt, ...user }: any) => ({
        ...user,
        password: "[REDACTED]",
        token: "[REDACTED]",
        pfp_picture_blob: "[REDACTED]",
      }));
    } catch (error) {
      throw new Exceptions.Unknown();
    }
  }

  async getProfilePhoto(username_system: string): Promise<{ blobString: string | null }> {
    try {
      const userRecord = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
        username_system,
        record_status: "A",
      });

      const blob = userRecord?.pfp_picture_blob;
      if (!blob) return { blobString: null };
      const decoded = Buffer.from(blob as any).toString("utf8");
      const blobString = decoded.startsWith("data:") ? decoded : `data:image/jpeg;base64,${decoded}`;
      return { blobString };
    } catch (error) {
      throw new Exceptions.Unknown();
    }
  }

  async updateUsername(
    username_system: string,
    newUsername: string,
    system: string,
  ): Promise<{ token: string; username: string }> {
    const user = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      username_system,
      record_status: "A",
    });
    if (!user) throw new Exceptions.Unknown();

    const newUsernameSystem = `${newUsername}_${system}`;
    const conflict = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
      username_system: newUsernameSystem,
      record_status: "A",
    });
    if (conflict) throw new Exceptions.UsernameAlreadyTaken();

    await this.db.update<ITB_AA_USER>(
      "tb_aa_user",
      { username_system, record_status: "A" },
      { username: newUsername, username_system: newUsernameSystem },
    );

    const parsedRoles: string[] = (() => {
      try {
        return JSON.parse(user.roles ?? "[]");
      } catch {
        return [];
      }
    })();

    const token = signToken({
      id: user.id!,
      username: newUsername,
      system,
      roles: parsedRoles,
      lastLoggedInDt: user.last_logged_in_dt,
    });

    await this.db.update<ITB_AA_USER>("tb_aa_user", { username_system: newUsernameSystem }, { token });

    return { token, username: newUsername };
  }
}
