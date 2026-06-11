export interface ITbTgStatsWhitelist {
  id?: number;
  telegram_user_id: number;
  telegram_chat_id?: number | null;
  added_dt: number;
  record_status: string;
}
