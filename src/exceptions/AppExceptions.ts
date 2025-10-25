import { InvalidLoginCredentialsException } from "./InvalidLoginCredentialsException";
import { UnknownException } from "./UnknownException";

export const Exceptions = {
  InvalidLoginCredentials: InvalidLoginCredentialsException,
  Unknown: UnknownException,
} as const;

export type ExceptionsType = typeof Exceptions;