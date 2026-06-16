import { BaseExceptions } from "./BaseException.js";

export class ExternalRequestException extends BaseExceptions {
  constructor(externalService: string) {
    super(
      "external_request_exception",
      `Something went wrong calling external service: ${externalService}`,
      400
    );
  }
}
