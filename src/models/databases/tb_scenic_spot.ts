export interface ITB_SCENIC_SPOT {
  id?: number;
  name_zh: string;
  name_en: string;
  province: string;
  city: string;
  province_en: string;
  city_en: string;
  sort_order: number;
  created_dt: number;
  record_status: string; // 'A' | 'D'
}
