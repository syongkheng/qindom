import { BaseExceptions } from "./BaseException";

export class ExternalRequestException extends BaseExceptions {
  constructor(externalService: string) {
    super(
      "external_request_exception",
      `Something went wrong calling external service: ${externalService}`,
      400
    );
  }
}
