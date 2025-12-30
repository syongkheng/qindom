import { BaseExceptions } from "./BaseException";

export class ParseJsonException extends BaseExceptions {
  constructor(process?: string) {
    super(
      `parse_json_exception`,
      process
        ? `Something went wrong parsing JSON: ${process}`
        : "Something went wrong parsing JSON",
      400
    );
  }
}
