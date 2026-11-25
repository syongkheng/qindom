## Token Service

No routes. Owns the session JWT: signing, verifying, and the settings both need.

| Export               | Purpose                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signToken(payload)` | Signs `{ id, username, system, roles, lastLoggedInDt }` (`IDecodedTokenUser`). Throws `UnknownException` on failure.                                                                                                                    |
| `verifyToken(token)` | Checks signature, algorithm and expiry; returns `IDecodedTokenUser`. Throws jsonwebtoken errors unchanged (`TokenExpiredError` is told apart by `TokenFilter`). **No DB revocation check**: callers compare against `tb_aa_user.token`. |
| `getJwtSecret()`     | Reads `JWT_SECRET` lazily (dotenv loads after ESM imports). Called once at boot in `index.ts` to fail fast.                                                                                                                             |
| `JWT_ALGORITHM`      | `"HS256"`, pinned for both sign and verify.                                                                                                                                                                                             |
| `JWT_TTL_MS`         | 30 days. Also the auth cookie `maxAge` (`AuthCookieUtilities`).                                                                                                                                                                         |

Used by: `auth` (login, logout revocation), `profile` (username change re-issues the token), `middlewares/TokenFilter` (Mandatory/Optional filters, `resolveSessionUser` for the camera WebSocket).
