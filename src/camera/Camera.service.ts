import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { ITbCameraDevice } from "../models/databases/tb_camera_device.js";
import { CameraDeviceDto, CameraRegisterDto } from "../models/dtos/CameraDeviceDto.js";
import { CameraClaimBody, CameraRegisterBody } from "../models/requests/CameraBody.js";
import { CameraRelay } from "./Camera.relay.js";
import { PairingCodeStore } from "./Camera.pairing.js";
import { CameraValidator } from "./Camera.validator.js";

const TB_CAMERA_DEVICE = "tb_camera_device";
/** Registered-but-never-claimed devices older than this are retired on the next registration. */
const UNCLAIMED_RETENTION_MS = 24 * 60 * 60 * 1000;

export const hashDeviceToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export class CameraService {
  constructor(
    private readonly db: KnexSqlUtilities,
    private readonly relay: CameraRelay,
    private readonly pairing: PairingCodeStore,
  ) {}

  private toDto(row: ITbCameraDevice): CameraDeviceDto {
    return {
      deviceId: row.uuid,
      name: row.name,
      online: this.relay.isOnline(row.uuid),
      pairedAt: row.paired_dt != null ? Number(row.paired_dt) : null,
      lastSeenAt: row.last_seen_dt != null ? Number(row.last_seen_dt) : null,
    };
  }

  /** Device token → active device row, or null. Used by the phone WebSocket. */
  async authenticateDevice(token: string): Promise<ITbCameraDevice | null> {
    if (!CameraValidator.isWellFormedToken(token)) return null;
    const row = await this.db.findOne<ITbCameraDevice>(TB_CAMERA_DEVICE, {
      token_hash: hashDeviceToken(token),
      record_status: "A",
    });
    return (row as ITbCameraDevice | undefined) ?? null;
  }

  async touch(deviceId: string): Promise<void> {
    await this.db.update<ITbCameraDevice>(TB_CAMERA_DEVICE, { uuid: deviceId, record_status: "A" }, { last_seen_dt: Date.now() });
  }

  async register(body: CameraRegisterBody): Promise<CameraRegisterDto> {
    let row: ITbCameraDevice | null = null;
    if (body.token && body.deviceId) {
      const existing = await this.authenticateDevice(body.token);
      if (existing && existing.uuid === body.deviceId) row = existing;
    }

    let token: string | null = null;
    if (!row) {
      await this.retireStaleUnclaimed();
      token = crypto.randomBytes(32).toString("base64url");
      row = await this.db.insert<ITbCameraDevice>(TB_CAMERA_DEVICE, {
        uuid: crypto.randomUUID(),
        token_hash: hashDeviceToken(token),
        user_id: null,
        name: body.name,
        record_status: "A",
        created_dt: Date.now(),
      });
    }

    if (row.user_id != null) {
      return { deviceId: row.uuid, token, paired: true, pairingCode: null, pairingExpiresAt: null };
    }
    const { code, expiresAt } = this.pairing.issue(row.uuid);
    return { deviceId: row.uuid, token, paired: false, pairingCode: code, pairingExpiresAt: expiresAt };
  }

  async claim(userId: number, body: CameraClaimBody): Promise<CameraDeviceDto> {
    const deviceId = this.pairing.claim(body.code);
    if (!deviceId) throw new Exceptions.InvalidRequest("code");

    const row = (await this.db.findOne<ITbCameraDevice>(TB_CAMERA_DEVICE, { uuid: deviceId, record_status: "A" })) as
      | ITbCameraDevice
      | undefined;
    if (!row || row.user_id != null) throw new Exceptions.InvalidRequest("code");

    const now = Date.now();
    const name = body.name ?? row.name;
    const [updated] = await this.db.update<ITbCameraDevice>(
      TB_CAMERA_DEVICE,
      { uuid: deviceId, record_status: "A" },
      { user_id: userId, name, paired_dt: now, updated_dt: now },
    );
    this.relay.bindDevice(deviceId, userId, name);
    return this.toDto(updated);
  }

  async list(userId: number): Promise<CameraDeviceDto[]> {
    const rows = await this.db.find<ITbCameraDevice>(
      TB_CAMERA_DEVICE,
      { user_id: userId, record_status: "A" },
      { orderBy: "paired_dt", orderDirection: "asc" },
    );
    return rows.map((row) => this.toDto(row));
  }

  async remove(userId: number, deviceId: string): Promise<{ deviceId: string }> {
    const row = await this.db.findOne<ITbCameraDevice>(TB_CAMERA_DEVICE, {
      uuid: deviceId,
      user_id: userId,
      record_status: "A",
    });
    if (!row) throw new Exceptions.NotFound();
    await this.db.update<ITbCameraDevice>(
      TB_CAMERA_DEVICE,
      { uuid: deviceId, user_id: userId, record_status: "A" },
      { record_status: "D", updated_dt: Date.now() },
    );
    this.pairing.revokeDevice(deviceId);
    this.relay.disconnectDevice(deviceId, userId);
    return { deviceId };
  }

  private async retireStaleUnclaimed(): Promise<void> {
    await this.db.raw(
      `UPDATE ${TB_CAMERA_DEVICE} SET record_status = 'D', updated_dt = ?
       WHERE user_id IS NULL AND record_status = 'A' AND created_dt < ?`,
      [Date.now(), Date.now() - UNCLAIMED_RETENTION_MS],
    );
  }
}
