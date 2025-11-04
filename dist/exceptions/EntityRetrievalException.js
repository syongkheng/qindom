"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityRetrievalException = void 0;
const BaseException_1 = require("./BaseException");
class EntityRetrievalException extends BaseException_1.BaseExceptions {
    constructor() {
        super("entity_retrieval_failed", "Entity Retrieval failed", 404);
    }
}
exports.EntityRetrievalException = EntityRetrievalException;
