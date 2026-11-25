## Connectivity Controller

- Health check: confirms the server is running and the DB answers `SELECT 1` (500 if not). Polled by `deploy.sh`.

---

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
        "timestamp": string (ISO 8601),
        "environment": string (NODE_ENV, or "unknown"),
        "database": "up"
    }
}
```

</details>

---
