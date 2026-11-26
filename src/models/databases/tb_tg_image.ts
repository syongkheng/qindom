import type { RecordStatus } from "../../constants/RecordStatus.js";

export interface ITB_TG_IMAGE {
  id?: number;
  short_code: string;
  uuid?: string | null;
  telegram_file_id: string;
  mime_type?: string | null;
  file_name?: string | null;
  size_in_bytes?: number | null;
  /** Uploader (`tb_aa_user.id`); NULL on rows uploaded before migration 20261126000200. */
  created_by_id?: number | null;
  created_dt: number;
  record_status: RecordStatus;
}
