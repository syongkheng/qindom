## LTA Controller

- Controller related to public transport data (bus arrival timings and services)
------------------------------------------------------------------------------------------

#### Get bus arrival timings for a stop

<details>
 <summary><code>GET</code> <code>/api/lta/timing</code></summary>

##### Query Parameters
```
busStopCode: string   // required, e.g. "83139"
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "serviceNo": string,
            "operator": string,
            "nextBus": { "estimatedArrival": string, "load": string, "type": string },
            "nextBus2": { "estimatedArrival": string, "load": string, "type": string },
            "nextBus3": { "estimatedArrival": string, "load": string, "type": string }
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------

#### Get bus services for a stop

<details>
 <summary><code>POST</code> <code>/api/lta/bus/services</code></summary>

##### Payload Format
```
{
    "busStopCode": string
}
```

##### Response Format
```
{
    "code": 200 | 500,
    "status": "Ok" | "Ko",
    "data": [
        {
            "serviceNo": string,
            "operator": string,
            "direction": number,
            "stopSequence": number,
            "distance": number,
            "wdFirstBus": string,
            "wdLastBus": string,
            "satFirstBus": string,
            "satLastBus": string,
            "sunFirstBus": string,
            "sunLastBus": string
        }
    ]
}
```
</details>

------------------------------------------------------------------------------------------
