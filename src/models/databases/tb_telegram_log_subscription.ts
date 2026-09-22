export interface ITbTelegramLogSubscription {
  id?: number;
  chat_id: number;
  module_key: string;
  is_enabled: number;
  updated_dt?: number | null;
  updated_by_id?: number | null;
  created_dt?: number;
  record_status?: string;
}
