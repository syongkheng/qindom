export interface ITbTelegramLink {
  telegram_user_id:  number;
  username:          string;
  telegram_username: string | null;
  dm_chat_id:        number | null;
  linked_dt:         number;
  record_status:     string;
}
