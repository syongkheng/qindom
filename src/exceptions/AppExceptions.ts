import { EntityCreationException } from "./EntityCreationException.js";
import { EntityNotFoundException } from "./EntityNotFoundException.js";
import { EntityRetrievalException } from "./EntityRetrievalException.js";
import { EntityUpdateException } from "./EntityUpdateException.js";
import { ExternalRequestException } from "./ExternalRequestException.js";
import { EmailNotVerifiedException } from "./EmailNotVerifiedException.js";
import { EmailAlreadyRegisteredException } from "./EmailAlreadyRegisteredException.js";
import { UsernameAlreadyTakenException } from "./UsernameAlreadyTakenException.js";
import { InvalidLoginCredentialsException } from "./InvalidLoginCredentialsException.js";
import { InvalidRequestException } from "./InvalidRequestException.js";
import { MaxVerifyAttemptsException } from "./MaxVerifyAttemptsException.js";
import { ParseJsonException } from "./ParseJsonException.js";
import { RegistrationException } from "./RegistrationException.js";
import { TokenExpiredException } from "./TokenExpiredException.js";
import { TokenFormatException } from "./TokenFormatException.js";
import { ForbiddenAccessException } from "./ForbiddenAccessException.js";
import { UnauthorizedAccessException } from "./UnauthorizedAccessException.js";
import { UnknownException } from "./UnknownException.js";
import { VerifyCodeExpiredException } from "./VerifyCodeExpiredException.js";
import { WeakPasswordException } from "./WeakPasswordException.js";

export const Exceptions = {
  ExternalRequest: ExternalRequestException,
  EntityCreation: EntityCreationException,
  EntityRetrieval: EntityRetrievalException,
  EntityUpdate: EntityUpdateException,
  EmailAlreadyRegistered: EmailAlreadyRegisteredException,
  EmailNotVerified: EmailNotVerifiedException,
  InvalidLoginCredentials: InvalidLoginCredentialsException,
  InvalidRequest: InvalidRequestException,
  MaxVerifyAttempts: MaxVerifyAttemptsException,
  ForbiddenAccess: ForbiddenAccessException,
  NotFound: EntityNotFoundException,
  ParseJsonException: ParseJsonException,
  RegistrationException: RegistrationException,
  TokenExpired: TokenExpiredException,
  TokenFormat: TokenFormatException,
  UnauthorizedAccess: UnauthorizedAccessException,
  Unknown: UnknownException,
  UsernameAlreadyTaken: UsernameAlreadyTakenException,
  VerifyCodeExpired: VerifyCodeExpiredException,
  WeakPassword: WeakPasswordException,
} as const;

export type ExceptionsType = typeof Exceptions;
