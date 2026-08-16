import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITbIotDeviceHeartbeat } from "../models/databases/tb_iot_device_heartbeat.js";
import { ITbIotCoordinateLog } from "../models/databases/tb_iot_coordinate_log.js";

export interface RecordHeartbeatInput {
  deviceId: string;
  deviceName?: string;
  ipAddress: string;
  userAgent: string;
}

export interface LogCoordinateInput {
  deviceId: string;
  lat?: number;
  lon?: number;
  alt?: number;
  temp?: number;
  recordedAt?: number; // epoch *seconds* as sent by the device clock — converted to ms below
  rssi?: number;
  chipTemp?: number;
  uptimeMs?: number;
  ipAddress: string;
}

export class IotService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async recordHeartbeat(input: RecordHeartbeatInput): Promise<{ deviceId: string; lastSeenDt: number }> {
    const now = Date.now();

    await this.db.upsert<ITbIotDeviceHeartbeat>(
      "tb_iot_device_heartbeat",
      {
        device_id: input.deviceId,
        device_name: input.deviceName ?? null,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        last_seen_dt: now,
        created_dt: now,
      },
      "device_id",
      {
        device_name: input.deviceName ?? null,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        last_seen_dt: now,
      },
    );

    return { deviceId: input.deviceId, lastSeenDt: now };
  }

  async getHeartbeat(deviceId: string): Promise<ITbIotDeviceHeartbeat | undefined> {
    return this.db.findOne<ITbIotDeviceHeartbeat>("tb_iot_device_heartbeat", { device_id: deviceId });
  }

  async logCoordinate(input: LogCoordinateInput): Promise<void> {
    const now = Date.now();

    await this.db.insert<ITbIotCoordinateLog>("tb_iot_coordinate_log", {
      device_id: input.deviceId,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      alt: input.alt ?? null,
      temp: input.temp ?? null,
      recorded_dt: typeof input.recordedAt === "number" ? input.recordedAt * 1000 : now,
      rssi: input.rssi ?? null,
      chip_temp: input.chipTemp ?? null,
      uptime_ms: input.uptimeMs ?? null,
      ip_address: input.ipAddress,
      created_dt: now,
    });
  }

  async getCoordinateHistory(deviceId: string, limit: number): Promise<ITbIotCoordinateLog[]> {
    return this.db.find<ITbIotCoordinateLog>(
      "tb_iot_coordinate_log",
      { device_id: deviceId },
      { limit, orderBy: "recorded_dt", orderDirection: "desc" },
    );
  }
}
