import crypto from "crypto";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { Time } from "../constants/Time.js";

export const PAIRING_CODE_TTL_MS = 10 * Time.MINUTE_MS;
export const PAIRING_CODE_DIGITS = 6;
const PAIRING_CODE_SPACE = 10 ** PAIRING_CODE_DIGITS;
/** Memory cap: issuing beyond this many live codes fails (registration is also rate-limited per IP). */
export const MAX_LIVE_PAIRING_CODES = 10_000;

/** Random integer in [0, max). Injectable so tests can force collisions. */
export type RandomInt = (max: number) => number;
const cryptoRandomInt: RandomInt = (max) => crypto.randomInt(0, max);

interface PairingEntry {
  deviceId: string;
  expiresAt: number;
}

export interface PairingCode {
  code: string;
  expiresAt: number;
}

/**
 * Six-digit pairing codes, held in memory (single PM2 process; a restart clears them and
 * phones simply re-register). One live code per device: issuing a new one revokes the old.
 * Codes are single-use and expire after `ttlMs`; guessing is throttled by the claim rate limiters.
 */
export class PairingCodeStore {
  private readonly byCode = new Map<string, PairingEntry>();
  private readonly byDevice = new Map<string, string>();

  constructor(
    private readonly ttlMs = PAIRING_CODE_TTL_MS,
    private readonly now: () => number = Date.now,
    private readonly randomInt: RandomInt = cryptoRandomInt,
  ) {}

  issue(deviceId: string): PairingCode {
    this.revokeDevice(deviceId);
    this.prune();
    if (this.byCode.size >= MAX_LIVE_PAIRING_CODES) throw new Exceptions.EntityCreation("pairing code");

    let code: string;
    do {
      code = this.randomInt(PAIRING_CODE_SPACE).toString().padStart(PAIRING_CODE_DIGITS, "0");
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
