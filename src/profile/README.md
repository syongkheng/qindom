## Profile Controller

- Controller related to user profile data (country and profile photo)
- All endpoints require a valid JWT token
------------------------------------------------------------------------------------------

#### Get user's country

<details>
 <summary><code>GET</code> <code>/api/pfp/user/country</code></summary>

Header: Authorization: Bearer <Token>

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "country": string } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Update user's country

<details>
 <summary><code>POST</code> <code>/api/pfp/user/country</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "country": string,
    "system": string
}
```

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "country": string } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Get user's profile photo

<details>
 <summary><code>GET</code> <code>/api/pfp/user/photo</code></summary>

Header: Authorization: Bearer <Token>

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "pfpPictureBlob": string | null } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Upload / replace profile photo

<details>
 <summary><code>POST</code> <code>/api/pfp/user/photo</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "blobString": string   // base64-encoded image
}
```

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "pfpPictureBlob": string } | string
}
```
</details>

------------------------------------------------------------------------------------------
