/** Body of `POST /file/delete`. Field name kept as fndom sends it (its private form field). */
export interface FileDeleteBody {
  _fileIdsToDelete: string[];
}

export interface FileDeletedDto {
  /** Rows actually soft-deleted: uuids that don't exist, are already deleted or aren't the caller's are not counted. */
  deleted: number;
}
