export interface ITB_AA_FEATURE_FLAG {
  id?: number
  feature_key: string    // e.g. 'kop_registration', 'pphs', 'travel'
  label: string          // Human-readable name
  is_enabled: number     // 1 = enabled, 0 = disabled
  remarks?: string | null
  updated_dt?: number | null
  updated_by?: string | null
  created_dt: number
  created_by: string
  record_status: string  // 'A' = active
}
