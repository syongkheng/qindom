"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityCreationException = void 0;
const BaseException_1 = require("./BaseException");
class EntityCreationException extends BaseException_1.BaseExceptions {
    constructor(entityName) {
        super("entity_creation_failed", entityName
            ? `Entity creation failed for ${entityName}`
            : "Entity creation failed", 400);
    }
}
exports.EntityCreationException = EntityCreationException;
