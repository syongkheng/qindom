// Redaction for everything that reaches the logs (console, request-log file /
// Log Searcher, Telegram). Matching is by field name across the whole object,
// not by text patterns, so nested and differently-formatted values are caught.

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;

// Compared after lower-casing and dropping "_"/"-" (api_key → apikey).
// Whole-name matches only, so e.g. inputTokens / keyHint / module_key are kept.
const ALWAYS_REDACT = new Set([
  "password",
  "newpassword",
  "oldpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "csrftoken",
  "jwt",
  "jwtsecret",
  "bottoken",
  "tokendatajson",
  "secret",
  "clientsecret",
  "apikey",
  "apikeyhash",
  "keyhash",
  "accountkey",
  "verifycode",
  "otp",
  "pin",
  "captchacode",
  "smsbody",
  "authorization",
  "cookie",
  "setcookie",
  "blob",
  "blobstring",
]);

const normalise = (field: string) => field.toLowerCase().replace(/[_-]/g, "");

// `code` is also the HTTP status in every response envelope and an error id
// ("invalid_request_code"), so only OTP-shaped values are hidden.
const isOtpLike = (value: unknown) => typeof value === "string" && /^\d{4,8}$/.test(value);

// `key` is also used for short identifiers (Telegram module keys, label keys),
// so only API-key-shaped values are hidden.
const isApiKeyLike = (value: unknown) =>
  typeof value === "string" && (/^(ss|iot|sk|pk)_/i.test(value) || value.length >= 16);

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  return at <= 0 ? value : `${value.charAt(0)}***${value.slice(at)}`;
}

/** Replacement for a field's value, or undefined if the field isn't sensitive. */
function redactField(field: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  const name = normalise(field);

  if (ALWAYS_REDACT.has(name)) {
    // Keep the size of SMS bodies so failed-parse debugging still has a clue
    return name === "smsbody" && typeof value === "string" ? `[REDACTED ${value.length} chars]` : REDACTED;
  }
  if (name === "code" && isOtpLike(value)) return REDACTED;
  if (name === "key" && isApiKeyLike(value)) return REDACTED;
  if (name === "email" && typeof value === "string") return maskEmail(value);
  return undefined;
}

/** Deep copy of `value` with sensitive fields redacted — never mutates the input. */
export function redactForLog(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const walk = (current: unknown, depth: number): unknown => {
    if (current === null || typeof current !== "object") return current;
    if (current instanceof Date) return current.toISOString();
    if (Buffer.isBuffer(current)) return `[binary ${current.length} bytes]`;
    if (depth > MAX_DEPTH) return "[…]";
    if (seen.has(current)) return "[Circular]";
    seen.add(current);

    if (Array.isArray(current)) return current.map((item) => walk(item, depth + 1));

    const out: Record<string, unknown> = {};
    for (const [field, fieldValue] of Object.entries(current)) {
      const replacement = redactField(field, fieldValue);
      out[field] = replacement !== undefined ? replacement : walk(fieldValue, depth + 1);
    }
    return out;
  };

  return walk(value, 0);
}

/** Same rules applied to a URL's query string, e.g. "/x?email=a@b.c&pin=123456". */
export function redactUrlForLog(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;

  const params = new URLSearchParams(url.slice(queryStart + 1));
  for (const [field, value] of [...params.entries()]) {
    const replacement = redactField(field, value);
    if (replacement !== undefined) params.set(field, String(replacement));
  }
  const query = params.toString();
  return query ? `${url.slice(0, queryStart)}?${query}` : url.slice(0, queryStart);
}

/** Best-effort pass over free text (error messages) that may embed JSON-ish fields. */
export function redactTextForLog(text: string): string {
  return text
    .replace(
      /"(password|token|secret|api_?key|apiKey|blob|blobString|smsBody|verify_code|pin|authorization|cookie)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"',
    )
    .replace(/"code"\s*:\s*"(\d{4,8})"/gi, '"code":"[REDACTED]"')
    .replace(/\b(ss|iot)_[A-Za-z0-9]{8,}/g, "$1_[REDACTED]")
    .replace(/"email"\s*:\s*"([^"]*)"/gi, (_, email: string) => `"email":"${maskEmail(email)}"`);
}
