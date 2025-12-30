export class CoordinateUtilities {
  public static formatCoord(value: unknown, maxChars = 16): string | null {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;

    // 6–8 decimal places is more than enough for GPS
    let formatted = num.toFixed(8); // e.g. 1.43755612

    // Trim trailing zeros
    formatted = formatted.replace(/\.?0+$/, "");

    // Hard safety cap
    if (formatted.length > maxChars) {
      formatted = formatted.slice(0, maxChars);
    }

    return formatted;
  }
}
