## Geocode Controller

- Controller for geocoding queries via Nominatim (OpenStreetMap)
- Results are cached in the database to reduce upstream requests
------------------------------------------------------------------------------------------

#### Search for a location

<details>
 <summary><code>GET</code> <code>/api/geocode</code></summary>

##### Query Parameters
```
q: string   // required, search query e.g. "Marina Bay Sands, Singapore"
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "place_id": number,
            "licence": string,
            "osm_type": string,
            "osm_id": number,
            "lat": string,
            "lon": string,
            "display_name": string,
            "boundingbox": string[]
        }
    ] | string
}
```

##### Example
```
GET /api/geocode?q=Changi+Airport+Singapore

{
    "code": 200,
    "status": "Ok",
    "data": [
        {
            "place_id": 123456,
            "lat": "1.3644",
            "lon": "103.9915",
            "display_name": "Singapore Changi Airport, Airport Boulevard, Changi, Singapore"
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------
