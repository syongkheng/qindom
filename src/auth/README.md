# auth

Accounts, sessions and the OWNER admin pages. Mounted at `/auth` with `mw.std` (no token filter on the mount; routes that need a session add `MandatoryTokenFilter` themselves).

| File                          | Role                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `Auth.controller.ts`          | Public + session routes; mounts the admin router at `/admin`                               |
| `AuthAdmin.controller.ts`     | `/auth/admin/*` (OWNER only)                                                               |
| `AuthRegistration.service.ts` | preflight, register, verify-email (OTP), resend                                            |
| `AuthSession.service.ts`      | login, `issueSession`, logout revocation, password validate/update                         |
| `AuthAdmin.service.ts`        | user list, role updates, request-log search                                                |
| `Auth.validator.ts`           | Body/param validators; `validateUsername` is shared with `profile`                         |
| `Auth.emailTemplate.ts`       | Pure builders for the OTP and password-changed emails (escape their input)                 |
| `Auth.types.ts`               | `Auth*Body` / `Auth*Dto`, `UserState`                                                      |
| `Permission.ts`               | `Roles`, `parseRoles`, `isValidRole`, `PermissionService` (resource grants), used app-wide |

DB: `tb_aa_user` (unique `username_system_active` among active rows), `tb_aa_resource_access` (Permission).

## Security model (do not change without a decision)

- **Sessions:** the JWT is only ever sent as the httpOnly `jwt_token` cookie (+ readable `csrf_token`) via `setAuthCookies`; it is never in a response body. Each new session is stored in `tb_aa_user.token`, and `MandatoryTokenFilter` rejects any cookie that isn't the stored token, so login / verify / password change revoke every other session. Roles are read from the DB row on every request, not from the JWT.
- **Soft-deleted = gone:** every user read and write is scoped to `record_status = 'A'`. `issueSession` stores the token by `{ id, record_status: 'A' }` (never by `username_system`, which a soft-deleted twin row can share), password writes and role updates likewise; a role update for a missing or soft-deleted user is 404. `PermissionService.listGrants` skips grants held by soft-deleted users.
- **CSRF:** every non-GET route behind `MandatoryTokenFilter` needs `X-CSRF-Token` = `csrf_token` cookie.
- **Passwords:** bcrypt, 10 rounds (`BCRYPT_SALT_ROUNDS`). Strength: ≥ 8 chars with lower, upper, digit and symbol (mirrored in fndom `PasswordUtils.ts`).
- **OTP:** 6 random digits, stored as `sha256Hex(code)`, valid 15 min (`OTP_TTL_MS`). Wrong codes **and wrong passwords** on `/verify-email` share one counter; at 5 (`MAX_VERIFY_ATTEMPTS`) every try is refused with 429 until a resend resets it.
- **Dev OTP bypass:** `111111` is accepted instead of the stored code only when `IS_DEV` (`NODE_ENV === "dev"`). It still needs the right password. fndom skips the real send in dev.
- **Squatting:** an unverified row whose OTP lapsed counts as free: preflight says register, and register soft-deletes it (matched by email or by username). `/verify-email` also requires the password the row was registered with, so whoever pre-registered someone else's email can't get the real owner to verify it.
- **Systems:** register only accepts `system` in `REGISTER_SYSTEMS` (`["fnd"]`); login/verify accept any (older rows).
- **Enumeration:** `/resend-verify` always answers 200 `{ sent: true }` (bad body, unknown email, mail failure alike). `/preflight` and register do reveal whether an email has an account (by design: they route the login form).
- **Rate limits** (per `X-Real-IP`): register 5/h, login 10/15 min, verify-email 10/15 min, resend 3/15 min, admin 60/15 min; plus the global 100/min.

## Endpoints

Envelope: `{ code, status, data }`. Errors: `data = { code, message, fieldName, typeOfError, timestamp }`; fndom (`stores/authentication.ts`) maps `data.code`.

| Method | Path                 | Auth                               | Body                                                    | `data` on 200                                                                                | Errors                                                                                                                                                                                                            |
| ------ | -------------------- | ---------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/preflight`         | none                               | `{ email, system }`                                     | `{ exist, nextStep: "login" \| "register" }`                                                 | 400 `invalid_request_<field>`                                                                                                                                                                                     |
| POST   | `/register`          | none                               | `{ username (3–64, trimmed), email, password, system }` | `{ requiresVerification: true, email }` + OTP email                                          | 400 `invalid_request_*` / `weak_password`; 409 `email_already_registered` / `username_already_taken`; 500 `registration_failed`                                                                                   |
| POST   | `/verify-email`      | none                               | `{ email, system, code (6 digits), password }`          | `{ username, roles }` + Set-Cookie                                                           | 400 `invalid_request_*` / `code_expired`; 401 `invalid_login_credentials` (unknown email, wrong password, wrong code); 409 `email_already_registered` (already verified: use `/login`); 429 `max_verify_attempts` |
| POST   | `/resend-verify`     | none                               | `{ email, system }`                                     | `{ sent: true }` (always)                                                                    | none                                                                                                                                                                                                              |
| POST   | `/login`             | none                               | `{ email, password, system }`                           | `{ username, roles }` + Set-Cookie                                                           | 400 `invalid_request_*`; 401 `invalid_login_credentials`; 403 `email_not_verified`                                                                                                                                |
| POST   | `/verification`      | cookie + CSRF                      | `{}`                                                    | `{ username, roles, exist: true }`                                                           | 401 `token_invalid`, 403 `csrf_invalid` (envelope `status`)                                                                                                                                                       |
| POST   | `/logout`            | none (reads the cookie if present) | `{}`                                                    | `{ loggedOut: true }`; clears both cookies, revokes the stored token if the JWT is valid     | none                                                                                                                                                                                                              |
| POST   | `/password/validate` | cookie + CSRF                      | `{ password }`                                          | `{ isValid }`                                                                                | 400 `invalid_request_password`                                                                                                                                                                                    |
| POST   | `/password/update`   | cookie + CSRF                      | `{ currentPassword, newPassword }`                      | `{ updated: true }` + new Set-Cookie (other sessions drop); notification email (best-effort) | 400 `weak_password` / `invalid_request_*`; 401 `invalid_login_credentials` (wrong current password)                                                                                                               |

Emails are lowercased and trimmed after the format check. Usernames are HTML-escaped in emails.

### Admin (`/auth/admin/*`)

Every route: `MandatoryTokenFilter` → `adminLimiter` → `requireRole(OWNER)` (`SYSTEM_R5`, read from the DB row). No cookie → 401 `token_invalid`; other roles → 403 `forbidden_access`. Resource grants never open these routes.

| Method | Path                                                   | Body / query                                          | `data` on 200                                                                                                       | Errors                                                                                                   |
| ------ | ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/users`                                         |                                                       | `[{ id, username, email, system, roles, state, lastLoggedInDt, createdDt }]` (oldest first; never passwords/tokens) |                                                                                                          |
| POST   | `/admin/users/:id/roles`                               | `{ roles: string[] }` (each `MODULE_R1-5` or `admin`) | `{ updated: true }`                                                                                                 | 400 `invalid_request_id` / `invalid_request_roles`; 404 `entity_not_found` (no active user with that id) |
| GET    | `/admin/recent-request-logs?limit=`                    | `limit` 1–20, default 3 (lenient)                     | `[{ requestId, timestamp, method, path, statusCode }]`                                                              |                                                                                                          |
| GET    | `/admin/request-logs/:requestId`                       | `req_` + 12 hex (or 5 hex for older logs)             | `RequestLogMatchDto[]` (`utils/logging/RequestLog.types.ts`; parsed by `utils/logging/RequestLogParser.ts`)         | 400 `invalid_request_requestId`; 404 `entity_not_found`                                                  |
| GET    | `/admin/telegram-log-subscriptions`                    |                                                       | `{ modules, chats }` matrix                                                                                         |                                                                                                          |
| POST   | `/admin/telegram-log-subscriptions/:chatId/:moduleKey` | `{ enabled: boolean }`                                | refreshed matrix                                                                                                    | 400 `invalid_request_moduleKey` / `invalid_request_chatId` / `invalid_request_enabled`                   |

## Tests

`Auth.test.ts`: in-process HTTP for every route (real controller, limiters and `MandatoryTokenFilter`; fake DB, stubbed mail, log search and Telegram service) pinning the security behaviour above, plus validator, helper, mapper, mail-builder and service unit tests (dev bypass on/off via the injected `devOtpBypass`).
