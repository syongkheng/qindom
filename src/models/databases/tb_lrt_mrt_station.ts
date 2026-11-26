/**
 * Seeded from LTA DataMall; every data column is a nullable VARCHAR.
 * NOT a typo: `lng` holds the latitude and `lat` the longitude (see `Lta.service.ts`).
 */
export interface ITB_LRT_MRT_STATION {
  id?: number;
  station: string | null;
  exit: string | null;
  lat: string | null;
  lng: string | null;
  type: string | null;
  created_dt: number;
  created_by: string;
}
