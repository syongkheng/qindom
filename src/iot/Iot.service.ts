import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITbIotDeviceHeartbeat } from "../models/databases/tb_iot_device_heartbeat.js";

export interface RecordHeartbeatInput {
  deviceId: string;
  deviceName?: string;
  ipAddress: string;
  userAgent: string;
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
}
