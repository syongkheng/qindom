export interface ITB_GEOCODE_CACHE {
  id?: number
  query: string          // normalized lowercase trimmed query
  results_json: string   // JSON.stringify of Nominatim result array
  created_dt: number     // Date.now()
}
