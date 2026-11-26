import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { signToken } from "../token/Token.service.js";
import { parseRoles } from "../auth/Permission.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ProfileCountryDto, ProfilePhotoDto, ProfilePhotoUpdatedDto, ProfileUsernameDto } from "./Profile.types.js";

const USER_TABLE = "tb_aa_user";
// Older rows stored raw base64 without the data-URL header; they were always JPEG.
const LEGACY_PHOTO_PREFIX = "data:image/jpeg;base64,";
const DATA_URL_SCHEME = "data:";

/** All methods act on the logged-in user's active row, looked up by id (from the DB-verified JWT). */
export class ProfileService {
  constructor(private db: KnexSqlUtilities) {}

  async getCountry(userId: number, logContext?: IRequestLogContext): Promise<ProfileCountryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Get country");
    const user = await this.db.findOne<ITB_AA_USER>(USER_TABLE, activeUser(userId), ["country"], event);
    return { country: user?.country || null };
  }

  async updateCountry(
    userId: number,
    country: string | null,
    logContext?: IRequestLogContext,
  ): Promise<ProfileCountryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update country");
    await this.db.update<ITB_AA_USER>(USER_TABLE, activeUser(userId), { country }, event);
    return { country };
  }

  async getProfilePhoto(userId: number, logContext?: IRequestLogContext): Promise<ProfilePhotoDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Get profile photo");
    const user = await this.db.findOne<ITB_AA_USER>(USER_TABLE, activeUser(userId), ["pfp_picture_blob"], event);
    const blob = user?.pfp_picture_blob;
    if (!blob) return { blobString: null };

    // LONGBLOB comes back as a Buffer.
    const decoded = Buffer.from(blob as unknown as Buffer).toString("utf8");
    return { blobString: decoded.startsWith(DATA_URL_SCHEME) ? decoded : `${LEGACY_PHOTO_PREFIX}${decoded}` };
  }

  async updateProfilePhoto(
    userId: number,
    dataUrl: string,
    logContext?: IRequestLogContext,
  ): Promise<ProfilePhotoUpdatedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update profile photo");
    await this.db.update<ITB_AA_USER>(USER_TABLE, activeUser(userId), { pfp_picture_blob: dataUrl }, event);
    return { updated: true };
  }

  /**
   * Renames the user and re-issues their JWT (the username is in the token and in the
   * DB-revocation key `username_system`). Returns the new token for the controller to set as a cookie.
   */
  async updateUsername(
    userId: number,
    newUsername: string,
    system: string,
    logContext?: IRequestLogContext,
  ): Promise<ProfileUsernameDto & { token: string }> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update username");
    const user = await this.db.findOne<ITB_AA_USER>(USER_TABLE, activeUser(userId), ["*"], event);
    if (!user) throw new Exceptions.NotFound("User not found");

    const newUsernameSystem = `${newUsername}_${system}`;
    const conflict = await this.db.findOne<ITB_AA_USER>(
      USER_TABLE,
      { username_system: newUsernameSystem, record_status: RecordStatus.ACTIVE },
      ["id"],
      event,
    );
    if (conflict) throw new Exceptions.UsernameAlreadyTaken();

    const token = signToken({
      id: userId,
      username: newUsername,
      system,
      roles: parseRoles(user.roles),
      lastLoggedInDt: user.last_logged_in_dt,
    });
    await this.db.update<ITB_AA_USER>(
      USER_TABLE,
      activeUser(userId),
      { username: newUsername, username_system: newUsernameSystem, token },
      event,
    );

    return { token, username: newUsername };
  }
}

function activeUser(userId: number) {
  return { id: userId, record_status: RecordStatus.ACTIVE };
}
