import { BaseExceptions } from "./BaseException";

export class EntityNotFoundException extends BaseExceptions {
  constructor() {
    super("entity_not_found", "Entity not found", 404);
  }
}
