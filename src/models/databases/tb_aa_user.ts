import { BaseEntity } from "../BaseEntity";

export interface ITB_AA_USER {
  id?: number;
  username: string;
  password: string;
  system: string;
  role: string;
  username_system?: string;
  state: string;
  last_logged_in_dt: number;
  token?: string;
  created_dt: number;
  created_by: string;
  record_status: string;
}

export class TB_AA_USER extends BaseEntity implements ITB_AA_USER {
  id?: number;
  username: string;
  password: string;
  system: string;
  role: string;
  username_system?: string;
  state: string;
  last_logged_in_dt: number;
  token?: string;
  created_dt: number;
  created_by: string;
  record_status: string;

  constructor(data: ITB_AA_USER) {
    super();
    this.id = data.id;
    this.username = data.username;
    this.password = data.password;
    this.system = data.system;
    this.role = data.role;
    this.username_system = `${data.username}_${data.system}`;
    this.state = data.state;
    this.last_logged_in_dt = data.last_logged_in_dt;
    this.token = data.token;
    this.created_dt = data.created_dt;
    this.created_by = data.created_by;
    this.record_status = data.record_status;
  }

  validate(): string | null {
    if (!this.username || typeof this.username !== "string") {
      return "Invalid or missing username";
    }
    if (!this.password || typeof this.password !== "string") {
      return "Invalid or missing password";
    }

    if (!this.system || typeof this.system !== "string") {
      return "Invalid or missing system";
    }

    if (!this.role || typeof this.role !== "string") {
      return "Invalid or missing role";
    }

    if (!this.created_dt || typeof this.created_dt !== "number") {
      return "Invalid or missing created_dt";
    }

    if (!this.created_by || typeof this.created_by !== "string") {
      return "Invalid or missing created_by";
    }

    return null;
  }
}
