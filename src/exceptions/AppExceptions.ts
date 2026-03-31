import { EntityCreationException } from "./EntityCreationException";
import { EntityNotFoundException } from "./EntityNotFoundException";
import { EntityRetrievalException } from "./EntityRetrievalException";
import { EntityUpdateException } from "./EntityUpdateException";
import { ExternalRequestException } from "./ExternalRequestException";
import { EmailNotVerifiedException } from "./EmailNotVerifiedException";
import { EmailAlreadyRegisteredException } from "./EmailAlreadyRegisteredException";
import { UsernameAlreadyTakenException } from "./UsernameAlreadyTakenException";
import { InvalidLoginCredentialsException } from "./InvalidLoginCredentialsException";
import { InvalidRequestException } from "./InvalidRequestException";
import { MaxVerifyAttemptsException } from "./MaxVerifyAttemptsException";
import { ParseJsonException } from "./ParseJsonException";
import { RegistrationException } from "./RegistrationException";
import { TokenExpiredException } from "./TokenExpiredException";
import { TokenFormatException } from "./TokenFormatException";
import { ForbiddenAccessException } from "./ForbiddenAccessException";
import { UnauthorizedAccessException } from "./UnauthorizedAccessException";
import { UnknownException } from "./UnknownException";
import { VerifyCodeExpiredException } from "./VerifyCodeExpiredException";

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
} as const;

export type ExceptionsType = typeof Exceptions;
