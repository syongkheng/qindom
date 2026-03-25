## FND Controller

- Controller related to Kingdom 236 (K236) features: governor identity lookup and KoP appointment booking
- Appointments are stored in the database and appended to a Google Sheet
------------------------------------------------------------------------------------------

#### Health ping

<details>
 <summary><code>GET</code> <code>/api/fnd</code></summary>

##### Response Format
```
{
    "code": 200,
    "status": "Ok",
    "data": "Ok"
}
```
</details>

------------------------------------------------------------------------------------------

#### Look up governor name by FID

Rate limit: 20 requests per 15 minutes per IP

<details>
 <summary><code>POST</code> <code>/api/fnd/identity</code></summary>

##### Payload Format
```
{
    "identity": string   // Kingshot governor FID (numeric string)
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": string   // governor nickname, or error message
}
```

##### Example
```
// Request
{ "identity": "12345678" }

// Success response
{ "code": 200, "status": "Ok", "data": "DragonLord" }

// Error — FID not found or wrong server
{ "code": 500, "status": "Ko", "data": "Invalid KS Response: code: 1, data: null" }
```
</details>

------------------------------------------------------------------------------------------

#### Submit KoP appointment

Rate limit: 5 requests per 1 hour per IP

<details>
 <summary><code>POST</code> <code>/api/fnd/appt</code></summary>

##### Payload Format
```
{
    "governorId": string,
    "governorName": string,
    "alliance": string,           // e.g. "VKG", "FND", "HKL", "AHG", "SOL", "OTH"
    "appointment": string[],      // selected days, e.g. ["D1", "D2"]
    "appointmentTiming": [
        {
            "day": string,
            "timeslots": string[]
        }
    ],
    "remarks": string             // optional
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "id": number,
        "governor_id": string,
        "governor_name": string,
        "alliance": string,
        "appointments": string,
        "appointment_timings": string,
        "status": "PENDING",
        "remarks": string
    } | string
}
```
</details>

------------------------------------------------------------------------------------------
