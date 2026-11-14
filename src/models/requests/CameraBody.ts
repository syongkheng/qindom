export interface CameraRegisterBody {
  name: string;
  deviceId?: string;
  token?: string;
}

export interface CameraClaimBody {
  code: string;
  name?: string;
}
