## Itinerary Controller

- Controller related to travel planner itineraries, agenda items, and bookings
- Most endpoints require authentication; public viewer and challenge endpoints do not
------------------------------------------------------------------------------------------

#### List all itineraries for the authenticated user

<details>
 <summary><code>GET</code> <code>/api/itinerary</code></summary>

Header: Authorization: Bearer <Token>

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "myTrips": [
            {
                "id": number,
                "sessionId": string,
                "sessionTitle": string,
                "destination": string | null,
                "startDate": string | null,
                "endDate": string | null,
                "numberOfPax": number,
                "shortCode": string
            }
        ],
        "sharedTrips": []
    }
}
```
</details>

------------------------------------------------------------------------------------------

#### Create a new itinerary

<details>
 <summary><code>POST</code> <code>/api/itinerary</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "sessionTitle": string,             // required
    "idempotencyKey": string,           // optional, prevents duplicate submissions
    "destination": string,              // optional
    "destinationRaw": string[],         // optional, array of city/region strings
    "country": string,                  // optional
    "numberOfPax": number,              // optional, defaults to 1
    "itineraryDateRaw": string[],       // optional
    "startDate": string,                // optional, YYYY-MM-DD
    "endDate": string,                  // optional, YYYY-MM-DD
    "unknownDate": boolean,             // optional
    "durationInDays": number,           // optional, defaults to 1
    "challenge": string,                // optional, access code for password protection
    "paxNames": string[],               // optional
    "agendaItems": [
        {
            "title": string,
            "category": string,
            "desc": string,
            "city": string,
            "cityRaw": string[],
            "startTime": string,        // "HH:MM"
            "endTime": string,          // "HH:MM"
            "durationInHours": number,
            "unknownTime": boolean,
            "budget": number,
            "day": number,
            "date": string,             // YYYY-MM-DD
            "coordinates": { "lat": number, "lng": number },
            "_agendaToFileMapping": string[]   // file UUIDs to associate
        }
    ],
    "bookings": [
        {
            "category": string,
            "item": string,
            "remarks": string,
            "link": string,
            "payment": string,
            "startDate": string,
            "endDate": string,
            "nights": number,
            "price": number,
            "booked": boolean,
            "freeCancellation": string,
            "breakfast": boolean,
            "deposit": string,
            "paxBreakdown": object,
            "sortOrder": number
        }
    ]
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "shortCode": string,
        "sessionId": string,
        "agendaToFileMap": [
            { "agendaId": number, "fileUuids": string[] }
        ]
    } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Get itinerary via public short code (viewer)

If the itinerary has a challenge (access code), only `{ "hasChallenge": true }` is returned — use the challenge endpoint to unlock it.

<details>
 <summary><code>GET</code> <code>/api/itinerary/v/:shortCode</code></summary>

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "hasChallenge": true
    }
    // or full itinerary if no access code:
    "data": {
        "id": number,
        "sessionId": string,
        "sessionTitle": string,
        "shortCode": string,
        "destination": string | null,
        "destinationRaw": string | null,
        "country": string | null,
        "numberOfPax": number,
        "startDate": string | null,
        "endDate": string | null,
        "unknownDate": boolean,
        "durationInDays": number,
        "paxNames": string[],
        "viewCount": number,
        "bookings": [ ... ],
        "agendaItems": [
            {
                "id": number,
                "title": string,
                "category": string | null,
                "desc": string | null,
                "city": string | null,
                "city_raw": string | null,
                "start_time": string | null,    // "HH:MM"
                "end_time": string | null,
                "duration_in_hours": number | null,
                "unknown_time": boolean,
                "budget": number | null,
                "day": number | null,
                "date": string | null,
                "coordinates": { "lat": number, "lng": number } | null,
                "files": [
                    {
                        "id": number,
                        "uuid": string,
                        "name": string | null,
                        "mime_type": string,
                        "size_in_bytes": number,
                        "blob": string           // base64 (viewer only)
                    }
                ]
            }
        ]
    }
}
```
</details>

------------------------------------------------------------------------------------------

#### Get itinerary for editing (auth required, no blobs)

<details>
 <summary><code>GET</code> <code>/api/itinerary/:sessionId</code></summary>

Header: Authorization: Bearer <Token>

##### Response Format
Same shape as public viewer but files contain metadata only (no `blob` field).

```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { ...itinerary, agendaItems: [ { ...item, files: [{ id, uuid, name, mime_type, size_in_bytes }] } ] }
}
```
</details>

------------------------------------------------------------------------------------------

#### Update an existing itinerary

<details>
 <summary><code>POST</code> <code>/api/itinerary/edit/:sessionId</code></summary>

Header: Authorization: Bearer <Token>

##### Payload Format
```
{
    "sessionTitle": string,
    "destination": string,
    "destinationRaw": string[],
    "country": string,
    "numberOfPax": number,
    "itineraryDateRaw": string[],
    "startDate": string,
    "endDate": string,
    "unknownDate": boolean,
    "durationInDays": number,
    "challenge": string | null,
    "paxNames": string[],
    "agendaItems": [ ...same as create, include "id" to update existing items ],
    "_agendaIdsToDelete": number[],   // agenda item IDs to soft-delete
    "_agendaIdsToUpdate": number[],
    "bookings": [ ...same as create, include "id" to update existing bookings ],
    "_bookingIdsToDelete": number[]
}
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 403 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "shortCode": string,
        "sessionId": string,
        "agendaToFileMap": [
            { "agendaId": number, "fileUuids": string[] }
        ]
    } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Delete an itinerary (soft delete)

<details>
 <summary><code>POST</code> <code>/api/itinerary/delete/:sessionId</code></summary>

Header: Authorization: Bearer <Token>

##### Response Format
```
{
    "code": 200 | 400 | 401 | 403 | 500,
    "status": "Ok" | "Ko",
    "data": { "deleted": true } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Unlock a password-protected itinerary

<details>
 <summary><code>POST</code> <code>/api/itinerary/challenge</code></summary>

##### Payload Format
```
{
    "shortCode": string,
    "challenge": string   // the access code
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": { ...full itinerary with viewCount } | string
}
```
</details>

------------------------------------------------------------------------------------------
