## Meal Controller

- Controller for the meal planner — log daily meals and attach photos
- All endpoints require authentication
- Valid meal types: `breakfast`, `lunch`, `dinner`, `snack`
- Photos are stored as base64 data URLs (max 5 MB); accepted types: JPEG, PNG, GIF, WebP, HEIC, HEIF
------------------------------------------------------------------------------------------

#### Get meals for a specific date

<details>
 <summary><code>GET</code> <code>/api/meal</code></summary>

Header: Authorization: Bearer <Token>

##### Query Parameters
```
date: string   // optional, YYYY-MM-DD — defaults to today
```

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "id": number,
            "logDate": string,
            "mealType": "breakfast" | "lunch" | "dinner" | "snack",
            "plannedName": string,
            "notes": string | null,
            "photo": {
                "uuid": string,
                "mimeType": string,
                "blob": string   // data URL, e.g. "data:image/jpeg;base64,..."
            } | null,
            "createdAt": number
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------

#### Get meals for a date range

<details>
 <summary><code>GET</code> <code>/api/meal/range</code></summary>

Header: Authorization: Bearer <Token>

##### Query Parameters
```
from: string   // required, YYYY-MM-DD
to: string     // required, YYYY-MM-DD
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "date": string,
            "meals": [
                {
                    "id": number,
                    "mealType": string,
                    "plannedName": string,
                    "notes": string | null,
                    "hasPhoto": boolean
                }
            ]
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------

#### Create a meal log entry

<details>
 <summary><code>POST</code> <code>/api/meal</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "logDate": string,      // required, YYYY-MM-DD
    "mealType": string,     // required — "breakfast" | "lunch" | "dinner" | "snack"
    "plannedName": string,  // required
    "notes": string         // optional
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "id": number } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Update a meal log entry

<details>
 <summary><code>POST</code> <code>/api/meal/update</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "id": number,           // required
    "plannedName": string,  // required
    "notes": string         // optional
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": null | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Delete a meal log entry (soft delete)

Also soft-deletes the associated photo if one exists.

<details>
 <summary><code>POST</code> <code>/api/meal/delete</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "id": number   // required
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": null | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Upload or replace a meal photo

Replaces any existing photo for the meal entry.

<details>
 <summary><code>POST</code> <code>/api/meal/photo</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "mealLogId": number,    // required
    "blob": string,         // required — data URL, e.g. "data:image/jpeg;base64,..."
    "name": string,         // optional, original filename
    "mimeType": string,     // optional
    "sizeInBytes": number   // optional
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": { "uuid": string } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Delete a meal photo

<details>
 <summary><code>POST</code> <code>/api/meal/photo/delete</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "mealLogId": number   // required
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 404 | 500,
    "status": "Ok" | "Ko",
    "data": null | string
}
```
</details>

------------------------------------------------------------------------------------------
