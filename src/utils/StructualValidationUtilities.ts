import { LogEmoji } from "../constants/LogEmoji.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";

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

  static boolean(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    if (typeof fieldToValidate !== "boolean") {
      if (event) event.children?.push(`'${fieldName}' boolean ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(`'${fieldName}' must be a boolean`);
    }

    if (event) {
      event.children?.push(`'${fieldName}' boolean ${LogEmoji.success} `);
    }
  }

  static number(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    if (typeof fieldToValidate !== "number" || Number.isNaN(fieldToValidate)) {
      if (event) event.children?.push(`'${fieldName}' number ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(`'${fieldName}' must be a number`);
    }

    if (event) {
      event.children?.push(`'${fieldName}' number ${LogEmoji.success} `);
    }
  }

  static oneOf<T extends string>(
    fieldToValidate: unknown,
    allowedValues: readonly T[],
    fieldName: string,
    event?: IRequestLogEvent,
  ) {
    if (typeof fieldToValidate !== "string" || !allowedValues.includes(fieldToValidate as T)) {
      if (event) event.children?.push(`'${fieldName}' oneOf ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(`'${fieldName}' must be one of: ${allowedValues.join(", ")}`);
    }

    if (event) {
      event.children?.push(`'${fieldName}' oneOf ${LogEmoji.success} `);
    }
  }

  /**
   * Validates that a field is required and constrained to a fixed set of values,
   * but only when `condition` is true (e.g. a dependent field that's only meaningful
   * when a sibling flag is set). No-op when `condition` is false.
   */
  static requiredOneOfWhen<T extends string>(
    condition: boolean,
    fieldToValidate: unknown,
    allowedValues: readonly T[],
    fieldName: string,
    event?: IRequestLogEvent,
  ): void {
    if (!condition) return;
    this.required(fieldToValidate, fieldName, event);
    this.oneOf(fieldToValidate, allowedValues, fieldName, event);
  }
}
