## TgImage (image CDN `/img` + CDN bot)

Images are stored as documents in a Telegram chat and served back through the API. Nothing is kept on disk.

- `TgImageService` owns `tb_tg_image` and the bot-admin writes to `tb_tg_stats_whitelist` (add / remove / chat id on `/start`). `TelegramLogSubscriptionService` (`utils/logging`) also reads the whitelist to fan out log alerts.
- **Storage chat** = the first active admin with a `telegram_chat_id` (set when that admin DMs the bot `/start`). With none, uploads fail with 500 and a server log.
- Env: `AWENSE_CDN_TELEGRAM_BOT_TOKEN` (read lazily; missing = 500 + server log; without it the bot doesn't start).
- `TgImage.bot.ts`: the polling bot. Admin commands `/start` (stores the private chat id), `/help`, `/stats` (file count + total size), `/list` (last 10 files). Non-admins get an access-denied reply with their Telegram user id.
- `TgLog.logSender.ts`: registers the Telegram transport for request-log alerts (`LoggingUtilities.setLogSender`). It only shares the bot token with this module.

### Security (keep as is)

- SVG is rasterised to PNG on upload and never stored as SVG; legacy SVG rows are rasterised again on read.
- Every other image is re-encoded on read to JPEG (quality 80) by sharp, after baking in the EXIF rotation. Raw stored bytes are never served.
- The download and re-encode are fully buffered (≤ 20 MB, Telegram's cap) before any header is written, so a Telegram failure or an undecodable stored file is a normal JSON error, never a half-sent response or a crashed stream.
- Uploads must be `image/*` (every fndom picker is `accept="image/*"`).
- Served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` (plus the global `nosniff`), because the files live on the API origin next to the auth/CSRF cookies.
- Uploads larger than 19 MB after the SVG step are re-encoded as JPEG (lower quality, then smaller width) to stay under Telegram's 20 MB download cap.

---

| Method | Path                | Auth              | Body                                                                                       | Response (`data`)                                                                                 |
| ------ | ------------------- | ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/img/:shortCode`   | public (`mw.pub`) |                                                                                            | image bytes (`image/jpeg`, or `image/png` for legacy SVG), `Cache-Control: public, max-age=86400` |
| `POST` | `/img/upload`       | JWT               | multipart: `file` (`image/*`, ≤ 30 MB), `sessionId?` (≤ 256, caption only), `uuid?` (≤ 36) | `TgImageUploadDto` `{ shortCode, url }` (`url` = `/img/<shortCode>`)                              |
| `GET`  | `/img/admin/list`   | JWT + SYSTEM_R5   |                                                                                            | `TgAdminDto[]` `{ id, telegramUserId, addedAt }`, newest first                                    |
| `POST` | `/img/admin/add`    | JWT + SYSTEM_R5   | `{ telegramUserId }`                                                                       | `{ added: true }` (idempotent; reactivates a removed admin)                                       |
| `POST` | `/img/admin/remove` | JWT + SYSTEM_R5   | `{ telegramUserId }`                                                                       | `{ removed: boolean }` (false = wasn't an active admin)                                           |

The JWT router is mounted without `RequestHeaderFilter` (multipart upload). The uploader's IP in the Telegram caption comes from `X-Real-IP` (as in RestRequestLogger). `shortCode` is 8 hex chars. `telegramUserId` is a positive integer (number or numeric string). The file name (≤ 512) and mime type (≤ 128) are checked against their columns.

##### Errors

| Status | When                                                                        | `data.code`                                                         |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 400    | upload without a `file` part, or not `image/*`                              | `invalid_request_file`                                              |
| 400    | file name / mime type / `sessionId` / `uuid` too long                       | `invalid_request_fileName` / `_mimeType` / `_sessionId` / `_uuid`   |
| 400    | `telegramUserId` missing / not a positive integer                           | `invalid_request_telegramUserId`                                    |
| 401    | no / invalid JWT (upload, admin)                                            | envelope `status: "token_invalid"`, `data` is a string (middleware) |
| 403    | admin route without SYSTEM_R5                                               | `forbidden_access`                                                  |
| 404    | unknown or deleted short code                                               | `entity_not_found`                                                  |
| 500    | bot token not configured, no storage chat yet, or stored file not decodable | `unknown`                                                           |
| 502    | Telegram unreachable or refusing (`sendDocument`, `getFile`, download)      | `external_request_exception`                                        |
