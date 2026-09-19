export interface ITB_PLACE_CACHE {
  id?: number;
  lat_rounded: number;
  lng_rounded: number;
  radius_m: number;
  results_json: string; // JSON.stringify of mapped { name, category, lat, lng, description? }[]
  created_dt: number;
}
