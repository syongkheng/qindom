export interface ProfileCountryDto {
  country: string | null;
}

export interface ProfilePhotoDto {
  /** `data:image/...;base64,...`, or null when no photo is set. */
  blobString: string | null;
}

export interface ProfilePhotoUpdatedDto {
  updated: true;
}

export interface ProfileUsernameDto {
  username: string;
}

export interface ProfileCountryBody {
  /** null clears the country (fndom sends "" when nothing is selected). */
  country: string | null;
}

export interface ProfilePhotoBody {
  /** Data URL from the browser's FileReader (`data:image/<type>;base64,<data>`). */
  blobString: string;
}

export interface ProfileUsernameBody {
  newUsername: string;
}
