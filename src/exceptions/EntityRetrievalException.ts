import { BaseExceptions } from "./BaseException.js";

export class EntityRetrievalException extends BaseExceptions {
  constructor() {
    super("entity_retrieval_failed", "Entity Retrieval failed", 404);
  }
}
