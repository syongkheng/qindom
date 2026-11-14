export interface CameraDeviceDto {
  deviceId: string;
  name: string;
  online: boolean;
  pairedAt: number | null;
  lastSeenAt: number | null;
}

export interface CameraRegisterDto {
  deviceId: string;
  /** Only returned when a new device is created; the phone must store it. */
  token: string | null;
  paired: boolean;
  pairingCode: string | null;
  pairingExpiresAt: number | null;
}
