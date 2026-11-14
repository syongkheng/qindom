import crypto from "crypto";

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_LIVE_CODES = 10_000;

interface PairingEntry {
  deviceId: string;
  expiresAt: number;
}

/**
 * Six-digit pairing codes, held in memory (single PM2 process). One live code
 * per device: issuing a new one revokes the old. Codes are single-use and
 * expire after `ttlMs`; guessing is throttled by the claim rate limiters.
 */
export class PairingCodeStore {
  private readonly byCode = new Map<string, PairingEntry>();
  private readonly byDevice = new Map<string, string>();

  constructor(
    private readonly ttlMs = PAIRING_CODE_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  issue(deviceId: string): { code: string; expiresAt: number } {
    this.revokeDevice(deviceId);
    this.prune();
    if (this.byCode.size >= MAX_LIVE_CODES) throw new Error("Too many pending pairing codes");

    let code: string;
    do {
      code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    } while (this.byCode.has(code));

    const expiresAt = this.now() + this.ttlMs;
    this.byCode.set(code, { deviceId, expiresAt });
    this.byDevice.set(deviceId, code);
    return { code, expiresAt };
  }

  /** Returns the device the code belongs to and consumes the code, or null. */
  claim(code: string): string | null {
    const entry = this.byCode.get(code);
    if (!entry) return null;
    this.byCode.delete(code);
    this.byDevice.delete(entry.deviceId);
    return entry.expiresAt > this.now() ? entry.deviceId : null;
  }

  revokeDevice(deviceId: string): void {
    const code = this.byDevice.get(deviceId);
    if (code === undefined) return;
    this.byDevice.delete(deviceId);
    this.byCode.delete(code);
  }

  get size(): number {
    return this.byCode.size;
  }

  private prune(): void {
    const now = this.now();
    for (const [code, entry] of this.byCode) {
      if (entry.expiresAt <= now) {
        this.byCode.delete(code);
        this.byDevice.delete(entry.deviceId);
      }
    }
  }
}
