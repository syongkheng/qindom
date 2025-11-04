"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseEntity = void 0;
class BaseEntity {
    isValid() {
        return this.validate() === null;
    }
    throwIfInvalid() {
        const error = this.validate();
        if (error) {
            throw new Error(`Validation failed: ${error}`);
        }
    }
}
exports.BaseEntity = BaseEntity;
