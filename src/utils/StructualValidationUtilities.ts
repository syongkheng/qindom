import { LogEmoji } from "../constants/LogEmoji.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";

type ValidationContext = "(M)" | "(O)";

export class StructuralValidationUtilities {
  // ── Primitives ───────────────────────────────────────────────────────────────

  static required(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent): void {
    if (fieldToValidate === undefined || fieldToValidate === null) {
      if (event) event.children?.push(`(M) '${fieldName}' required ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(fieldName, "mandatory");
    }
    if (event) event.children?.push(`(M) '${fieldName}' required ${LogEmoji.success} `);
  }

  static string(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent, ctx: ValidationContext = "(M)") {
    if (typeof fieldToValidate !== "string") {
      if (event) event.children?.push(`${ctx} '${fieldName}' string ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(fieldName, "format");
    }
    if (event) event.children?.push(`${ctx} '${fieldName}' string ${LogEmoji.success} `);
  }

  static boolean(
    fieldToValidate: unknown,
    fieldName: string,
    event?: IRequestLogEvent,
    ctx: ValidationContext = "(M)",
  ) {
    if (typeof fieldToValidate !== "boolean") {
      if (event) event.children?.push(`${ctx} '${fieldName}' boolean ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(fieldName, "format");
    }
    if (event) event.children?.push(`${ctx} '${fieldName}' boolean ${LogEmoji.success} `);
  }

  static number(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent, ctx: ValidationContext = "(M)") {
    if (typeof fieldToValidate !== "number" || Number.isNaN(fieldToValidate)) {
      if (event) event.children?.push(`${ctx} '${fieldName}' number ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(fieldName, "format");
    }
    if (event) event.children?.push(`${ctx} '${fieldName}' number ${LogEmoji.success} `);
  }

  static oneOf<T extends string>(
    fieldToValidate: unknown,
    allowedValues: readonly T[],
    fieldName: string,
    event?: IRequestLogEvent,
    ctx: ValidationContext = "(M)",
  ) {
    if (typeof fieldToValidate !== "string" || !allowedValues.includes(fieldToValidate as T)) {
      if (event) event.children?.push(`${ctx} '${fieldName}' oneOf ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(fieldName, "format");
    }
    if (event) event.children?.push(`${ctx} '${fieldName}' oneOf ${LogEmoji.success} `);
  }

  static regex(
    fieldToValidate: unknown,
    pattern: RegExp,
    fieldName: string,
    event?: IRequestLogEvent,
    ctx: ValidationContext = "(M)",
  ) {
    if (typeof fieldToValidate !== "string" || !pattern.test(fieldToValidate)) {
      if (event) event.children?.push(`${ctx} '${fieldName}' regex ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(fieldName, "format");
    }
    if (event) event.children?.push(`${ctx} '${fieldName}' regex ${LogEmoji.success} `);
  }

  static email(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent, ctx: ValidationContext = "(M)") {
    this.regex(fieldToValidate, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, fieldName, event, ctx);
  }

  // ── Optional field helpers (skip if absent, validate format if present) ─────

  static optionalString(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    if (fieldToValidate === undefined || fieldToValidate === null) {
      if (event) event.children?.push(`(O) '${fieldName}' ${LogEmoji.warning}`);
      return;
    }
    this.string(fieldToValidate, fieldName, event, "(O)");
  }

  static optionalEmail(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    if (fieldToValidate === undefined || fieldToValidate === null) {
      if (event) event.children?.push(`(O) '${fieldName}' ${LogEmoji.warning}`);
      return;
    }
    this.string(fieldToValidate, fieldName, event, "(O)");
    this.email(fieldToValidate, fieldName, event, "(O)");
  }

  static optionalContactNumber(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    if (fieldToValidate === undefined || fieldToValidate === null) {
      if (event) event.children?.push(`(O) '${fieldName}' ${LogEmoji.warning}`);
      return;
    }
    this.regex(fieldToValidate, /^\+?[\d\s\-().]{7,20}$/, fieldName, event, "(O)");
  }

  // ── Combined required + type helpers ─────────────────────────────────────────

  static requiredString(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    this.required(fieldToValidate, fieldName, event);
    this.string(fieldToValidate, fieldName, event);
  }

  static requiredNumber(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    this.required(fieldToValidate, fieldName, event);
    this.number(fieldToValidate, fieldName, event);
  }

  static requiredBoolean(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    this.required(fieldToValidate, fieldName, event);
    this.boolean(fieldToValidate, fieldName, event);
  }

  static requiredEmail(fieldToValidate: unknown, fieldName: string, event?: IRequestLogEvent) {
    this.required(fieldToValidate, fieldName, event);
    this.email(fieldToValidate, fieldName, event);
  }

  static requiredOneOf<T extends string>(
    fieldToValidate: unknown,
    allowedValues: readonly T[],
    fieldName: string,
    event?: IRequestLogEvent,
  ) {
    this.required(fieldToValidate, fieldName, event);
    this.oneOf(fieldToValidate, allowedValues, fieldName, event);
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
