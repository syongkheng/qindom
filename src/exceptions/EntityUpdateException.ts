import { BaseExceptions } from "./BaseException";

export class EntityUpdateException extends BaseExceptions {
  constructor(entityName?: string) {
    super(
      "entity_update_failed",
      entityName
        ? `Entity update failed for ${entityName}`
        : "Entity update failed",
      400
    );
  }
}
