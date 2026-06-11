export interface ITbMarketplaceProviderKey {
  id?: number
  provider: string       // 'anthropic' | 'openai' | 'google' | 'meta'
  api_key: string
  label: string
  is_active: number      // 1 = active, 0 = disabled
  usage_count: number
  last_used_dt: number | null
  created_dt: number
  record_status: string  // 'A' = active, 'D' = deleted
}
