import { MediaType } from "../dtos/TelegramDto.js";

export interface ITbTelegramMedia {
  id:               string;
  telegram_file_id: string;
  file_type:        MediaType;
  file_name:        string | null;
  file_size:        number | null;
  owner_username:   string;
  telegram_user_id: number;
  created_dt:       number;
  expires_dt:       number | null;
  record_status:    string;
}
