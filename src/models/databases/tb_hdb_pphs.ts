import { BaseEntity } from "../BaseEntity";

export interface ITB_HDB_PPHS {
  id?: number;
  batch: string;
  json_string: string;
  created_dt: number;
  created_by: string;
}

export class TB_HDB_PPHS extends BaseEntity implements ITB_HDB_PPHS {
  id?: number;
  batch: string;
  json_string: string;
  created_dt: number;
  created_by: string;

  constructor(data: Partial<ITB_HDB_PPHS> = {}) {
    super();
    this.id = data.id;
    this.batch = data.batch || "";
    this.json_string = data.json_string || "";
    this.created_dt = data.created_dt || Date.now();
    this.created_by = data.created_by || "";
  }

  validate(): string | null {
    if (!this.batch || this.batch.trim() === "") {
      return "Batch is required";
    }
    if (!this.json_string || this.json_string.trim() === "") {
      return "JSON string is required";
    }
    if (!this.created_dt || this.created_dt <= 0) {
      return "Created date is required and must be positive";
    }
    if (!this.created_by || this.created_by.trim() === "") {
      return "Created by is required";
    }

    // Additional validation for JSON string format
    try {
      JSON.parse(this.json_string);
    } catch (error) {
      return "JSON string must be valid JSON format";
    }

    return null; // No errors
  }

}
