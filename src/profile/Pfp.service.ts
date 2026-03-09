import { UnknownException } from "../exceptions/UnknownException";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";

/**
 * Service to handle connectivity checks.
 */
export class PfpService {
  constructor(private db: KnexSqlUtilities) {}

  async getCountry(
    username_system: string
  ): Promise<{ country: string | null }> {
    try {
      const userRecord = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
        username_system,
        record_status: "A",
      });
      return { country: userRecord?.country || null };
    } catch (error) {
      throw new UnknownException();
    }
  }

  async updateCountry(
    username_system: string,
    country: string
  ): Promise<ITB_AA_USER[]> {
    try {
      const updatedUser = await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { username_system, record_status: "A" },
        { country }
      );
      return updatedUser.map(({ record_status, created_dt, ...user }: any) => ({
        ...user,
        password: "[REDACTED]",
        token: "[REDACTED]",
      }));
    } catch (error) {
      throw new UnknownException();
    }
  }

  async updateProfilePhoto(
    username_system: string,
    photoUrl: string
  ): Promise<ITB_AA_USER[]> {
    try {
      const updatedUser = await this.db.update<ITB_AA_USER>(
        "tb_aa_user",
        { username_system, record_status: "A" },
        { pfp_picture_blob: photoUrl }
      );
      return updatedUser.map(({ record_status, created_dt, ...user }: any) => ({
        ...user,
        password: "[REDACTED]",
        token: "[REDACTED]",
      }));
    } catch (error) {
      throw new UnknownException();
    }
  }

  async getProfilePhoto(
    username_system: string
  ): Promise<{ blobString: string | null }> {
    try {
      const userRecord = await this.db.findOne<ITB_AA_USER>("tb_aa_user", {
        username_system,
        record_status: "A",
      });

      return { blobString: userRecord?.pfp_picture_blob || null };
    } catch (error) {
      throw new UnknownException();
    }
  }
}
