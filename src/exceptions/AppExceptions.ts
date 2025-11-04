import { EntityCreationException } from "./EntityCreationException";
import { EntityNotFoundException } from "./EntityNotFoundException";
import { EntityRetrievalException } from "./EntityRetrievalException";
import { EntityUpdateException } from "./EntityUpdateException";
import { InvalidLoginCredentialsException } from "./InvalidLoginCredentialsException";
import { InvalidRequestException } from "./InvalidRequestException";
import { RegistrationException } from "./RegistrationException";
import { TokenExpiredException } from "./TokenExpiredException";
import { TokenFormatException } from "./TokenFormatException";
import { UnknownException } from "./UnknownException";

export const Exceptions = {
  InvalidLoginCredentials: InvalidLoginCredentialsException,
  InvalidRequest: InvalidRequestException,
  RegistrationException: RegistrationException,
  EntityCreation: EntityCreationException,
  EntityRetrieval: EntityRetrievalException,
  EntityUpdate: EntityUpdateException,
  TokenExpired: TokenExpiredException,
  TokenFormat: TokenFormatException,
  NotFound: EntityNotFoundException,
  Unknown: UnknownException,

} as const;

export type ExceptionsType = typeof Exceptions;