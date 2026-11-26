import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { Time } from "../constants/Time.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITB_CAMERA_DEVICE } from "../models/databases/tb_camera_device.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { CameraRelay } from "./Camera.relay.js";
import { PairingCodeStore } from "./Camera.pairing.js";
import { isWellFormedDeviceToken } from "./Camera.validator.js";
import {
  CameraClaimBody,
  CameraDeviceDto,
  CameraDeviceIdentity,
  CameraDeviceRemovedDto,
  CameraRegisterBody,
  CameraRegisterDto,
} from "./Camera.types.js";

const CAMERA_DEVICE_TABLE = "tb_camera_device";
const USER_TABLE = "tb_aa_user";
/** Registered-but-never-claimed devices older than this are retired on the next registration. */
export const UNCLAIMED_RETENTION_MS = Time.DAY_MS;
const DEVICE_TOKEN_BYTES = 32;
const IDENTITY_COLUMNS = ["uuid", "user_id", "name"] as const;
const DTO_COLUMNS = ["uuid", "name", "paired_dt", "last_seen_dt"] as const;

/** A new device token: 32 random bytes, base64url. Only its SHA-256 is stored. */
const randomDeviceToken = () => crypto.randomBytes(DEVICE_TOKEN_BYTES).toString("base64url");

export function toCameraDeviceDto(row: ITB_CAMERA_DEVICE, online: boolean): CameraDeviceDto {
  return {
    deviceId: row.uuid,
    name: row.name,
    online,
    // BIGINT columns can come back as strings.
    pairedAt: row.paired_dt != null ? Number(row.paired_dt) : null,
    lastSeenAt: row.last_seen_dt != null ? Number(row.last_seen_dt) : null,
  };
}

const toIdentity = (row: ITB_CAMERA_DEVICE): CameraDeviceIdentity => ({
  deviceId: row.uuid,
  userId: row.user_id ?? null,
  name: row.name,
});

/**
 * Owns `tb_camera_device` (device ↔ user binding). Pairing codes and live sockets are in
 * memory (`PairingCodeStore`, `CameraRelay`), so the API must run as a single process.
 */
export class CameraService {
  constructor(
    private readonly db: KnexSqlUtilities,
    private readonly relay: CameraRelay,
    private readonly pairing: PairingCodeStore,
    private readonly newDeviceToken: () => string = randomDeviceToken,
  ) {}

  /**
   * Device token → the active device, or null. Used by the phone WebSocket upgrade and by `register`.
   * A claimed device also needs its owner's user row to be active: a soft-deleted owner counts as
   * gone (CODING_STYLE §7), so the token is treated exactly like an unknown one. Unclaimed devices
   * (`user_id` NULL) have no owner to check and stay valid so they can pair.
   */
  async authenticateDevice(token: string, logContext?: IRequestLogContext): Promise<CameraDeviceIdentity | null> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Authenticate camera device");
    if (!isWellFormedDeviceToken(token)) return null;
    const row = await this.db.findOne<ITB_CAMERA_DEVICE>(
      CAMERA_DEVICE_TABLE,
      { token_hash: sha256Hex(token), record_status: RecordStatus.ACTIVE },
      IDENTITY_COLUMNS,
      event,
    );
    if (!row) return null;
    if (row.user_id != null) {
      const owner = await this.db.findOne<ITB_AA_USER>(
        USER_TABLE,
        { id: row.user_id, record_status: RecordStatus.ACTIVE },
        ["id"],
        event,
      );
      if (!owner) {
        if (event) event.detail = "owner not active";
        return null;
      }
    }
    return toIdentity(row);
  }

  /** Stamps `last_seen_dt` (phone socket connect / disconnect). */
  async touch(deviceId: string, logContext?: IRequestLogContext): Promise<void> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Touch camera device");
    await this.db.update<ITB_CAMERA_DEVICE>(
      CAMERA_DEVICE_TABLE,
      { uuid: deviceId, record_status: RecordStatus.ACTIVE },
      { last_seen_dt: Date.now() },
      event,
    );
  }

  async register(body: CameraRegisterBody, logContext?: IRequestLogContext): Promise<CameraRegisterDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Register camera device");
    let device: CameraDeviceIdentity | null = null;
    if (body.token && body.deviceId) {
      const existing = await this.authenticateDevice(body.token, logContext);
      if (existing && existing.deviceId === body.deviceId) device = existing;
    }

    let token: string | null = null;
    if (!device) {
      await this.retireStaleUnclaimed(event);
      token = this.newDeviceToken();
      const row = await this.db.insert<ITB_CAMERA_DEVICE>(
        CAMERA_DEVICE_TABLE,
        {
          uuid: crypto.randomUUID(),
          token_hash: sha256Hex(token),
          user_id: null,
          name: body.name,
          record_status: RecordStatus.ACTIVE,
          created_dt: Date.now(),
        },
        event,
      );
      device = toIdentity(row);
    }
    if (event) event.detail = token ? "new device" : "known device";

    if (device.userId != null) {
      return { deviceId: device.deviceId, token, paired: true, pairingCode: null, pairingExpiresAt: null };
    }
    const { code, expiresAt } = this.pairing.issue(device.deviceId);
    return { deviceId: device.deviceId, token, paired: false, pairingCode: code, pairingExpiresAt: expiresAt };
  }

  async claim(userId: number, body: CameraClaimBody, logContext?: IRequestLogContext): Promise<CameraDeviceDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Claim camera device");
    // Consumed even if the checks below fail: a code is good for one attempt.
    const deviceId = this.pairing.claim(body.code);
    if (!deviceId) throw new Exceptions.InvalidRequest("code");

    const row = await this.db.findOne<ITB_CAMERA_DEVICE>(
      CAMERA_DEVICE_TABLE,
      { uuid: deviceId, record_status: RecordStatus.ACTIVE },
      ["name", "user_id"],
      event,
    );
    if (!row || row.user_id != null) throw new Exceptions.InvalidRequest("code");

    const now = Date.now();
    const name = body.name ?? row.name;
    const [updated] = await this.db.update<ITB_CAMERA_DEVICE>(
      CAMERA_DEVICE_TABLE,
      { uuid: deviceId, record_status: RecordStatus.ACTIVE },
      { user_id: userId, name, paired_dt: now, updated_dt: now },
      event,
    );
    this.relay.bindDevice(deviceId, userId, name);
    return toCameraDeviceDto(updated, this.relay.isOnline(deviceId));
  }

  async list(userId: number, logContext?: IRequestLogContext): Promise<CameraDeviceDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List camera devices");
    const rows = await this.db.find<ITB_CAMERA_DEVICE>(
      CAMERA_DEVICE_TABLE,
      { user_id: userId, record_status: RecordStatus.ACTIVE },
      { orderBy: "paired_dt", orderDirection: "asc", columns: DTO_COLUMNS },
      event,
    );
    if (event) event.detail = `${rows.length} devices`;
    return rows.map((row) => toCameraDeviceDto(row, this.relay.isOnline(row.uuid)));
  }

  async remove(userId: number, deviceId: string, logContext?: IRequestLogContext): Promise<CameraDeviceRemovedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Remove camera device");
    const owned = { uuid: deviceId, user_id: userId, record_status: RecordStatus.ACTIVE };
    const row = await this.db.findOne<ITB_CAMERA_DEVICE>(CAMERA_DEVICE_TABLE, owned, ["id"], event);
    if (!row) throw new Exceptions.NotFound();
    await this.db.update<ITB_CAMERA_DEVICE>(
      CAMERA_DEVICE_TABLE,
      owned,
      { record_status: RecordStatus.DELETED, updated_dt: Date.now() },
      event,
    );
    this.pairing.revokeDevice(deviceId);
    this.relay.disconnectDevice(deviceId, userId);
    return { deviceId };
  }

  private async retireStaleUnclaimed(event?: IRequestLogEvent): Promise<void> {
    const now = Date.now();
    await this.db.raw(
      `UPDATE ${CAMERA_DEVICE_TABLE} SET record_status = ?, updated_dt = ?
       WHERE user_id IS NULL AND record_status = ? AND created_dt < ?`,
      [RecordStatus.DELETED, now, RecordStatus.ACTIVE, now - UNCLAIMED_RETENTION_MS],
      event,
    );
  }
}
