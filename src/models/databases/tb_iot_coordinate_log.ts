export interface ITbIotCoordinateLog {
  id?: number;
  device_id: string;

  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
  temp?: number | null;

  recorded_dt: number; // ms epoch — when the fix was captured on-device, not when it was received

  rssi?: number | null;
  chip_temp?: number | null;
  uptime_ms?: number | null;

  ip_address?: string | null;
  created_dt: number; // ms epoch — when the server inserted this row
}
