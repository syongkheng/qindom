"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityUpdateException = void 0;
const BaseException_1 = require("./BaseException");
class EntityUpdateException extends BaseException_1.BaseExceptions {
    constructor(entityName) {
        super("entity_update_failed", entityName
            ? `Entity update failed for ${entityName}`
            : "Entity update failed", 400);
    }
}
exports.EntityUpdateException = EntityUpdateException;
