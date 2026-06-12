import { LogEmoji } from "../constants/LogEmoji";
import { Exceptions } from "../exceptions/AppExceptions";
import { IRequestLogEvent } from "../models/IRequestLogContext";

export class StructuralValidationUtilities {
  static required(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent): void {
    if (fieldToValidate === undefined || fieldToValidate === null) {
      if (event) event.children?.push(`'${fieldName}' required ${LogEmoji.error} `);

      throw new Exceptions.InvalidRequest(`'${fieldName}' is required`);
    }

    if (event) {
      event.children?.push(`'${fieldName}' required ${LogEmoji.success} `);
    }
  }

  static string(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    if (typeof fieldToValidate !== "string") {
      if (event) event.children?.push(`'${fieldName}' string ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(`'${fieldName}' must be a string`);
    }

    if (event) {
      event.children?.push(`'${fieldName}' string ${LogEmoji.success} `);
    }
  }
}
