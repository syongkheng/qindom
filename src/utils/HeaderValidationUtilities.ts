import { LogEmoji } from "../constants/LogEmoji.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { IncomingHttpHeaders } from "http";

export class HeaderValidationUtilities {
  static required(headers: IncomingHttpHeaders, headerName: string, event?: IRequestLogEvent): string {
    const value = headers[headerName.toLowerCase()];

    if (!value) {
      event?.children.push(`(M) '${headerName}' ${LogEmoji.error} `);
      throw new Exceptions.InvalidRequest(`Missing required header '${headerName}'`);
    }

    const headerValue = Array.isArray(value) ? value[0] : value;

    event?.children.push(`(M) '${headerName}' ${LogEmoji.success}`);

    return headerValue;
  }

  static optional(headers: IncomingHttpHeaders, headerName: string, event?: IRequestLogEvent): string | undefined {
    const value = headers[headerName.toLowerCase()];

    if (!value) {
      event?.children.push(`(O) '${headerName}' ${LogEmoji.warning} `);
      return undefined;
    }

    const headerValue = Array.isArray(value) ? value[0] : value;

    event?.children.push(`(O) '${headerName}' ${LogEmoji.success} `);

    return headerValue;
  }
}
