export interface SsApiKeyStatusDto {
  hasKey: boolean;
  name: string | null;
  createdDt: number | null;
  /** First characters of the raw key, so the user can tell keys apart. */
  keyHint: string | null;
}

/** The raw key (`ss_<hex>`). Returned once, at generation; only its hash is stored. */
export interface SsApiKeyGeneratedDto {
  key: string;
}

export interface SsApiKeyRevokedDto {
  revoked: true;
}

export interface SsApiKeyRenameBody {
  name: string;
}
