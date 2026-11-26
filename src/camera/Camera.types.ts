// REST shapes for /camera (frozen: mirrored in fndom `interfaces/Camera.model.ts` and the
// fndom-react-native recorder). WebSocket message shapes live in Camera.protocol.ts.

/** A phone as the dashboard sees it (`GET /camera/device`, `POST /camera/device/claim`). */
export interface CameraDeviceDto {
  deviceId: string;
  name: string;
  /** Has a live phone socket right now (in-memory relay state). */
  online: boolean;
  pairedAt: number | null;
  lastSeenAt: number | null;
}

/** `POST /camera/device/register` (phone). */
export interface CameraRegisterDto {
  deviceId: string;
  /** Only returned when a new device is created; the phone must store it. */
  token: string | null;
  paired: boolean;
  pairingCode: string | null;
  pairingExpiresAt: number | null;
}

/** `POST /camera/device/:deviceId/delete`. */
export interface CameraDeviceRemovedDto {
  deviceId: string;
}

/** What the phone socket needs to know about an authenticated device. */
export interface CameraDeviceIdentity {
  deviceId: string;
  /** Null until a dashboard user claims the device. */
  userId: number | null;
  name: string;
}

export interface CameraRegisterBody {
  name: string;
  /** Present only together with `token` (both well-formed). */
  deviceId?: string;
  token?: string;
}

export interface CameraClaimBody {
  code: string;
  name?: string;
}
