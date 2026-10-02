/**
 * PDPA-oriented helpers for masking personal data before it leaves the server.
 *
 * Masking is a data-minimisation measure for RESPONSES only — it never changes
 * what is stored. The stored value stays intact so the owner can still edit
 * their own record; clients only ever receive the masked form.
 */
export class MaskingUtilities {
  /**
   * Masks the trailing characters of a name with '*':
   *   length  > 3  → last 3 characters masked
   *   length == 3  → last 2 characters masked
   *   length == 2  → last 1 character masked
   *   length <= 1  → returned unchanged (nothing meaningful to hide)
   *
   * e.g. "Jonathan" → "Jonath**", "Tan" → "T**", "YK" → "Y*"
   */
  static maskName(name: string | null | undefined): string {
    const value = (name ?? "").trim();
    const len = value.length;

    let maskCount = 0;
    if (len > 3) maskCount = 3;
    else if (len === 3) maskCount = 2;
    else if (len === 2) maskCount = 1;
    else return value;

    return value.slice(0, len - maskCount) + "*".repeat(maskCount);
  }
}
