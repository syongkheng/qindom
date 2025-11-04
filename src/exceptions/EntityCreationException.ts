import { BaseExceptions } from "./BaseException";

export class EntityCreationException extends BaseExceptions {
  constructor(entityName?: string) {
    super(
      "entity_creation_failed",
      entityName
        ? `Entity creation failed for ${entityName}`
        : "Entity creation failed",
      400
    );
  }
}
