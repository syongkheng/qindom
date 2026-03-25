## Connectivity Controller

- Health check to confirm server is running
------------------------------------------------------------------------------------------

#### Check server status

<details>
 <summary><code>GET</code> <code>/connectivity</code></summary>

##### Response Format
```
{
    "code": 200 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "status": "ok",
        "message": "Server is connected",
        "timestamp": string (ISO 8601)
    }
}
```
</details>

------------------------------------------------------------------------------------------
