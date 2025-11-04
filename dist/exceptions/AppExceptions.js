"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Exceptions = void 0;
const EntityCreationException_1 = require("./EntityCreationException");
const EntityNotFoundException_1 = require("./EntityNotFoundException");
const EntityRetrievalException_1 = require("./EntityRetrievalException");
const EntityUpdateException_1 = require("./EntityUpdateException");
const InvalidLoginCredentialsException_1 = require("./InvalidLoginCredentialsException");
const InvalidRequestException_1 = require("./InvalidRequestException");
const RegistrationException_1 = require("./RegistrationException");
const TokenExpiredException_1 = require("./TokenExpiredException");
const TokenFormatException_1 = require("./TokenFormatException");
const UnknownException_1 = require("./UnknownException");
exports.Exceptions = {
    InvalidLoginCredentials: InvalidLoginCredentialsException_1.InvalidLoginCredentialsException,
    InvalidRequest: InvalidRequestException_1.InvalidRequestException,
    RegistrationException: RegistrationException_1.RegistrationException,
    EntityCreation: EntityCreationException_1.EntityCreationException,
    EntityRetrieval: EntityRetrievalException_1.EntityRetrievalException,
    EntityUpdate: EntityUpdateException_1.EntityUpdateException,
    TokenExpired: TokenExpiredException_1.TokenExpiredException,
    TokenFormat: TokenFormatException_1.TokenFormatException,
    NotFound: EntityNotFoundException_1.EntityNotFoundException,
    Unknown: UnknownException_1.UnknownException,
};
