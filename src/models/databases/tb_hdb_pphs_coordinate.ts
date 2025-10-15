import { BaseEntity } from "../BaseEntity";

export interface ITB_HDB_PPHS_COORDINATE {
  id?: number;
  building: string;
  formed_url: string;
  lat: string;
  lng: string;
  created_dt: number;
  created_by: string;
}

export class TB_HDB_PPHS_COORDINATE
  extends BaseEntity
  implements ITB_HDB_PPHS_COORDINATE
{
  id?: number;
  building: string;
  formed_url: string;
  lat: string;
  lng: string;
  created_dt: number;
  created_by: string;

  constructor(data: ITB_HDB_PPHS_COORDINATE) {
    super();
    this.id = data.id;
    this.building = data.building;
    this.formed_url = data.formed_url;
    this.lat = data.lat;
    this.lng = data.lng;
    this.created_dt = data.created_dt;
    this.created_by = data.created_by;
  }

  validate(): string | null {
    if (!this.building || typeof this.building !== "string") {
      return "Invalid or missing building";
    }
    if (!this.formed_url || typeof this.formed_url !== "string") {
      return "Invalid or missing formed_url";
    }
    if (!this.lat || isNaN(Number(this.lat))) {
      return "Invalid or missing latitude";
    }
    if (!this.lng || isNaN(Number(this.lng))) {
      return "Invalid or missing longitude";
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
