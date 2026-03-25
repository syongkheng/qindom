## HDB Controller

- Controller related to HDB housing data, building coordinates, and nearby transport
------------------------------------------------------------------------------------------

#### Get HDB PPHS data for a batch

<details>
 <summary><code>POST</code> <code>/api/hdb/pphs</code></summary>

##### Payload Format
```
{
    "batch": string   // e.g. "012025" (MMYYYY)
}
```

##### Response Format
```
{
    "code": 200 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "building": string,
            "lat": string,
            "lng": string,
            "formedUrl": string
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------

#### Update building coordinates (Admin only)

<details>
 <summary><code>POST</code> <code>/api/hdb/pphs/update</code></summary>

Header: Authorization: Bearer <Token>  (requires R5 role)

##### Payload Format
```
{
    "address": string,
    "lat": string,
    "lng": string,
    "formedUrl": string
}
```

##### Response Format
```
{
    "code": 200 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": { "building": string, "lat": string, "lng": string, "formedUrl": string } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Find nearest bus stops by location

<details>
 <summary><code>POST</code> <code>/api/hdb/pphs/busstops</code></summary>

##### Payload Format
```
{
    "lat": string,
    "lng": string,
    "radius": number   // in metres
}
```

##### Response Format
```
{
    "code": 200 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "busStopCode": string,
            "roadName": string,
            "desc": string,
            "lat": number,
            "lng": number,
            "distanceMetres": number
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------

#### Find nearest MRT stations by location

<details>
 <summary><code>POST</code> <code>/api/hdb/pphs/mrt</code></summary>

##### Payload Format
```
{
    "lat": string,
    "lng": string,
    "limit": number   // optional, defaults to 3
}
```

##### Response Format
```
{
    "code": 200 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "station": string,
            "exit": string,
            "lat": number,
            "lng": number,
            "type": string,
            "distanceMetres": number
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------
