"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityNotFoundException = void 0;
const BaseException_1 = require("./BaseException");
class EntityNotFoundException extends BaseException_1.BaseExceptions {
    constructor() {
        super("entity_not_found", "Entity not found", 404);
    }
}
exports.EntityNotFoundException = EntityNotFoundException;
