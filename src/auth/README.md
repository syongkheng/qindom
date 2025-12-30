## Authentication Controller

- Controller related to authentication
------------------------------------------------------------------------------------------

#### Determining whether the next step should be register or login

<details>
 <summary><code>POST</code> <code>/api/auth/preflight</code></summary>

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
 <summary><code>POST</code> <code>/api/auth/login</code></summary>

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
    "data": { "token": string } | { "code": string, "message": string, "timestamp": number }
}
```
</details>

#### Creating a new account

<details>
 <summary><code>POST</code> <code>/api/auth/register</code></summary>

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
    "data": { "token": string } | { "code": string, "message": string, "timestamp": number }
}
```
</details>

#### Verify token validity

<details>
 <summary><code>POST</code> <code>/api/auth/verification</code></summary>

##### Payload Format
```
{
    "token": string
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "The provided token is not in the correct format.",
    "data": { "username": string, "role": string, "exist": boolean } | { "code": string, "message": string, "timestamp": number }
}
```
</details>

#### Validate password (Current password)

<details>
 <summary><code>POST</code> <code>/api/auth/password/validate</code></summary>

Header: Authorization: Bearer <Token>
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
 <summary><code>POST</code> <code>/api/auth/password/update</code></summary>

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