import type { UserState } from "../../auth/Auth.types.js";
import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_AA_USER {
  id?: number;
  username: string;
  email?: string | null;
  email_verified?: number; // 0 = unverified, 1 = verified
  verify_code?: string | null; // SHA-256 hex of the OTP
  verify_code_expires_at?: number | null; // Unix ms expiry
  verify_attempts?: number; // brute-force guard
  password: string;
  system: string;
  country?: string | null; // VARCHAR(256) DEFAULT NULL
  roles: string; // JSON-encoded string[] e.g. '["SYSTEM_R5","TRAVEL_R3"]'
  username_system?: string;
  state: UserState;
  last_logged_in_dt: number | null; // null until the first login
  token?: string | null;
  /** LONGBLOB: written as a data-URL string, read back as a Buffer. */
  pfp_picture_blob?: string | Buffer | null;
  created_dt: number;
  created_by: string;
  record_status: RecordStatus;
}
