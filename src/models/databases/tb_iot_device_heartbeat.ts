export interface ITbIotDeviceHeartbeat {
  device_id: string;
  device_name?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  last_seen_dt: number;
  created_dt: number;
}
