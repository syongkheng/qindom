/**
 * PDPA-oriented helpers for masking personal data before it leaves the server.
 *
 * Masking is a data-minimisation measure for RESPONSES only: it never changes
 * what is stored. The stored value stays intact so the owner can still edit
 * their own record; clients only ever receive the masked form.
 */

const MASK_CHAR = "*";
/** Characters hidden at the end of a name, by name length (longer names: MAX_MASKED). */
const MAX_MASKED = 3;

/**
 * Masks the trailing characters of a (trimmed) name with '*', counting Unicode characters:
 *   length  > 3  → last 3 characters masked
 *   length == 3  → last 2 characters masked
 *   length == 2  → last 1 character masked
 *   length <= 1  → returned unchanged (nothing meaningful to hide)
 *
 * e.g. "Jonathan" → "Jonat***", "Tan" → "T**", "YK" → "Y*"
 */
export function maskName(name: string | null | undefined): string {
  const chars = [...(name ?? "").trim()];
  if (chars.length <= 1) return chars.join("");
  const maskCount = Math.min(MAX_MASKED, chars.length - 1);
  return chars.slice(0, chars.length - maskCount).join("") + MASK_CHAR.repeat(maskCount);
}
