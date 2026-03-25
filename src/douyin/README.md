## Douyin Controller

- Controller for Douyin (TikTok CN) livestream monitoring
- All endpoints require authentication and are subject to a rate limit of 15 requests per minute
------------------------------------------------------------------------------------------

#### Check if a Douyin user is currently live

<details>
 <summary><code>GET</code> <code>/api/douyin/live</code></summary>

Header: Authorization: Bearer <Token>

##### Query Parameters
```
userId: string   // required, Douyin user ID
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "isLive": boolean,
        "roomId": string | null,
        "streamUrl": string | null,
        "title": string | null
    } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Get audience rank list for a live room

<details>
 <summary><code>GET</code> <code>/api/douyin/ranklist</code></summary>

Header: Authorization: Bearer <Token>

##### Query Parameters
```
roomId: string      // required, live room ID
anchorId: string    // required, anchor (streamer) user ID
```

##### Response Format
```
{
    "code": 200 | 400 | 401 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "rankList": [
            {
                "userId": string,
                "nickname": string,
                "score": number,
                "rank": number
            }
        ]
    } | string
}
```
</details>

------------------------------------------------------------------------------------------
