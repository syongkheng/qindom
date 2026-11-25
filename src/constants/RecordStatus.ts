/** Soft-delete flag stored in every table's `record_status` CHAR(1) column. */
export const RecordStatus = {
  ACTIVE: "A",
  DELETED: "D",
} as const;

export type RecordStatus = (typeof RecordStatus)[keyof typeof RecordStatus];
