import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { StructuralValidationUtilities as V } from "../utils/StructuralValidationUtilities.js";
import { validateUsername } from "../auth/Auth.validator.js";
import { ProfileCountryBody, ProfilePhotoBody, ProfileUsernameBody } from "./Profile.types.js";

// tb_aa_user.country is VARCHAR(256).
const COUNTRY_MAX_LENGTH = 256;
// Size is already capped by express.json (5 MB); this only checks it's an image data URL.
const IMAGE_DATA_URL_REGEX = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;

export function validateCountryBody(body: Record<string, unknown>, event?: IRequestLogEvent): ProfileCountryBody {
  V.string(body.country, "country", event); // absent stays a 400 (optionalText alone would read it as a clear)
  return { country: V.optionalText(body.country, "country", COUNTRY_MAX_LENGTH, event) };
}

export function validatePhotoBody(body: Record<string, unknown>, event?: IRequestLogEvent): ProfilePhotoBody {
  V.requiredString(body.blobString, "blobString", event);
  const isImageDataUrl = IMAGE_DATA_URL_REGEX.test(body.blobString as string);
  event?.children?.push(`'blobString' image data URL ${isImageDataUrl ? LogEmoji.success : LogEmoji.error} `);
  if (!isImageDataUrl) throw new Exceptions.InvalidRequest("blobString", "format");
  return { blobString: body.blobString as string };
}

export function validateUsernameBody(body: Record<string, unknown>, event?: IRequestLogEvent): ProfileUsernameBody {
  return { newUsername: validateUsername(body.newUsername, "newUsername", event) };
}
