import { EntityCreationException } from "./EntityCreationException";
import { EntityNotFoundException } from "./EntityNotFoundException";
import { EntityRetrievalException } from "./EntityRetrievalException";
import { EntityUpdateException } from "./EntityUpdateException";
import { ExternalRequestException } from "./ExternalRequestException";
import { EmailNotVerifiedException } from "./EmailNotVerifiedException";
import { InvalidLoginCredentialsException } from "./InvalidLoginCredentialsException";
import { InvalidRequestException } from "./InvalidRequestException";
import { ParseJsonException } from "./ParseJsonException";
import { RegistrationException } from "./RegistrationException";
import { TokenExpiredException } from "./TokenExpiredException";
import { TokenFormatException } from "./TokenFormatException";
import { UnauthorizedAccessException } from "./UnauthorizedAccessException";
import { UnknownException } from "./UnknownException";

export const Exceptions = {
  ExternalRequest: ExternalRequestException,
  EntityCreation: EntityCreationException,
  EntityRetrieval: EntityRetrievalException,
  EntityUpdate: EntityUpdateException,
  EmailNotVerified: EmailNotVerifiedException,
  InvalidLoginCredentials: InvalidLoginCredentialsException,
  InvalidRequest: InvalidRequestException,
  NotFound: EntityNotFoundException,
  ParseJsonException: ParseJsonException,
  RegistrationException: RegistrationException,
  TokenExpired: TokenExpiredException,
  TokenFormat: TokenFormatException,
  UnauthorizedAccess: UnauthorizedAccessException,
  Unknown: UnknownException,
} as const;

export type ExceptionsType = typeof Exceptions;
