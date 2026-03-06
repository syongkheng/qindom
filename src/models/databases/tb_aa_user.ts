export interface ITB_AA_USER {
  id?: number;
  username: string;
  password: string;
  system: string;
  country?: string;
  roles: string; // JSON-encoded string[] e.g. '["PPHS_R5","KS_R3"]'
  username_system?: string;
  state: string;
  last_logged_in_dt: number;
  token?: string;
  pfp_picture_blob?: string;
  created_dt: number;
  created_by: string;
  record_status: string;
}
