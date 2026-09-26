## Authentication Controller

- Controller related to authentication
------------------------------------------------------------------------------------------

#### Determining whether the next step should be register or login

<details>
 <summary><code>POST</code> <code>/auth/preflight</code></summary>

##### Payload Format
```
{
    "username": string,
    "system": string
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko,
    "data": { "exist": boolean, "nextStep": "register" | "login" } | string
}
```
</details>

#### Logging in

<details>
 <summary><code>POST</code> <code>/auth/login</code></summary>

##### Payload Format
```
{
    "username": string,
    "password": string,
    "system": string
}
```

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Invalid login credentials",
    "data": { "username": string, "roles": string[] } | { "code": string, "message": string, "timestamp": number }
}
```
On success, sets the `jwt_token` (httpOnly) and `csrf_token` cookies via `Set-Cookie` — the JWT is never present in the response body.
</details>

#### Creating a new account

<details>
 <summary><code>POST</code> <code>/auth/register</code></summary>

##### Payload Format
```
{
    "username": string,
    "password": string,
    "system": string,
    "role": string
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "username": string, "roles": string[] } | { "code": string, "message": string, "timestamp": number }
}
```
</details>

#### Verify token validity

<details>
 <summary><code>POST</code> <code>/auth/verification</code></summary>

Requires the `jwt_token` cookie (sent automatically by the browser) — no payload.

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "token_invalid",
    "data": { "username": string, "roles": string[], "exist": boolean } | { "code": string, "message": string, "timestamp": number }
}
```
</details>

#### Log out

<details>
 <summary><code>POST</code> <code>/auth/logout</code></summary>

Requires the `jwt_token` cookie. Clears the `jwt_token` and `csrf_token` cookies.

##### Response Format
```
{
    "code": 200,
    "status": "Ok",
    "data": { "loggedOut": true }
}
```
</details>

#### Validate password (Current password)

<details>
 <summary><code>POST</code> <code>/auth/password/validate</code></summary>

Requires the `jwt_token` cookie plus a matching `X-CSRF-Token` header (value of the `csrf_token` cookie).
##### Payload Format
```
{
    "password": string
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "isValid": boolean } | string | { "code": string, "message": string, "timestamp": number }
}
```
</details>

#### Change password

<details>
 <summary><code>POST</code> <code>/auth/password/update</code></summary>

##### Payload Format
```
{
    "newPassword": string
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": string?
}
```
</details>

------------------------------------------------------------------------------------------