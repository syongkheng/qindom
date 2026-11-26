/**
 * The session JWT payload (`signToken` / `verifyToken`). Also what the token filters put on
 * `req.user` (declared globally in `src/types/express/index.d.ts`), with `roles` re-read from the DB.
 */
export interface IDecodedTokenUser {
  id: number;
  username: string;
  system: string;
  roles: string[];
  /** `tb_aa_user.last_logged_in_dt` when the session was issued; null on the first login. */
  lastLoggedInDt: number | null;
}
