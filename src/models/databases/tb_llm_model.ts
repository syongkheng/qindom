export interface ITbLlmModel {
  id?: number;
  model_name: string;
  model_key: string;
  record_status?: string;
  created_dt: number;
  created_by_id: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
}
