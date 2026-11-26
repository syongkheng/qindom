## Exceptions

All typed exceptions live in `AppExceptions.ts`. Throw them through the registry, never import a class directly:

```ts
throw new Exceptions.NotFound("No log entries found for that Request ID");
```

`route()` / `handleException` turn any `BaseException` into `{ code: httpStatus, status: <ClassName>, data: toResponseMessage() }`; anything else becomes a generic 500.

| Registry key                                                 | HTTP | `code`                                                | Custom message     |
| ------------------------------------------------------------ | ---- | ----------------------------------------------------- | ------------------ |
| `InvalidRequest(field?, "mandatory" \| "format" \| "limit")` | 400  | `invalid_request_<field>` / `invalid_request_generic` | built from field   |
| `WeakPassword`                                               | 400  | `weak_password`                                       |                    |
| `VerifyCodeExpired`                                          | 400  | `code_expired`                                        |                    |
| `UnauthorizedAccess(message?)`                               | 401  | `unauthorized_access`                                 | yes                |
| `InvalidLoginCredentials`                                    | 401  | `invalid_login_credentials`                           |                    |
| `ForbiddenAccess(message?)`                                  | 403  | `forbidden_access`                                    | yes                |
| `EmailNotVerified`                                           | 403  | `email_not_verified`                                  |                    |
| `NotFound(message?)`                                         | 404  | `entity_not_found`                                    | yes                |
| `EmailAlreadyRegistered`                                     | 409  | `email_already_registered`                            |                    |
| `UsernameAlreadyTaken`                                       | 409  | `username_already_taken`                              |                    |
| `UnsupportedMediaType`                                       | 415  | `unsupported_media_type`                              |                    |
| `MaxVerifyAttempts`                                          | 429  | `max_verify_attempts`                                 |                    |
| `Unknown`                                                    | 500  | `unknown`                                             |                    |
| `Registration`                                               | 500  | `registration_failed`                                 |                    |
| `EntityCreation(entity?)` / `EntityUpdate(entity?)`          | 500  | `entity_creation_failed` / `entity_update_failed`     | built from entity  |
| `ExternalRequest(service)`                                   | 502  | `external_request_exception`                          | built from service |

**Contract:** fndom reads `data.code` to choose a translated message, and the class name is the envelope `status`. Changing either is a frontend change.
