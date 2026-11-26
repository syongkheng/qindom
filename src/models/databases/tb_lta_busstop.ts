/** Seeded from LTA DataMall; every data column is a nullable VARCHAR. */
export interface ITB_LTA_BUSSTOP {
  id?: number;
  busstop_code: string | null;
  road_name: string | null;
  desc: string | null;
  lat: string | null;
  lng: string | null;
  created_dt: number;
  created_by: string;
}
