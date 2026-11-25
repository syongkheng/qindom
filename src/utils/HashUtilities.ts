import crypto from "crypto";

/** SHA-256 of a UTF-8 string as lowercase hex. Used to store API keys, OTPs and device tokens. */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
