export interface ITB_AA_RESOURCE_ACCESS {
  id?: number;
  user_id: number;
  resource_type: string; // e.g. 'analytics_system'
  resource_key: string; // e.g. 'jessikheng'
  access_level: string; // 'viewer'
  granted_by_id?: number | null;
  record_status: string; // 'A' = active grant, 'D' = revoked
  created_dt: number;
  updated_dt: number;
}
