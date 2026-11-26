import type { RecordStatus } from "../../constants/RecordStatus.js";
import type { WhitelistRemovedStatus } from "../../tgimage/TgImage.types.js";

export interface ITB_TG_STATS_WHITELIST {
  id?: number;
  telegram_user_id: number;
  telegram_chat_id?: number | null;
  added_dt: number;
  record_status: RecordStatus | WhitelistRemovedStatus; // "I" = removed admin (legacy value)
}
