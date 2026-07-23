import { BaseExceptions } from "./BaseException.js";

interface InvalidRequestStructuralErrors {
  mandatory: "Mandatory"
  format: "Format error"
}

const ERROR_TEMPLATES: Record<keyof InvalidRequestStructuralErrors, (field: string) => string> = {
  mandatory: (field) => `Missing field - ${field}`,
  format:    (field) => `Invalid format - ${field}`,
}

export class InvalidRequestException extends BaseExceptions {
  constructor(fieldName?: string, errorType?: keyof InvalidRequestStructuralErrors) {
    const message = errorType && fieldName
      ? ERROR_TEMPLATES[errorType](fieldName)
      : fieldName
      ? `Invalid request: ${fieldName}`
      : "Invalid request"
    super(`invalid_request_${fieldName}`, message, 400, fieldName, errorType)
  }
}
