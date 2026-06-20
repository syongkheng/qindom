export type DiaperLoadLevel = "light" | "medium" | "heavy";

export interface ITB_BABY_DIAPER_RECORD {
  id?: number;
  changed_dt?: number;
  has_stool?: boolean;
  has_urine?: boolean;
  stool_load?: DiaperLoadLevel | null;
  urine_load?: DiaperLoadLevel | null;
  record_status?: string;
  created_dt?: number;
  created_by_id?: number;
  updated_dt?: number;
  updated_by_id?: number | null;
}
