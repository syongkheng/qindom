## Analytics Controller

- Controller related to user session activity tracking (heartbeat)
- Authentication is optional — anonymous sessions are recorded with username "Anonymous"
------------------------------------------------------------------------------------------

#### Record a heartbeat (session activity ping)

<details>
 <summary><code>POST</code> <code>/api/analytics/heartbeat</code></summary>

Header: Authorization: Bearer <Token>  (optional)

##### Payload Format
```
{
    "sessionId": string   // client-generated session identifier
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": { "message": "Heartbeat recorded successfully." } | string
}
```
</details>

------------------------------------------------------------------------------------------
