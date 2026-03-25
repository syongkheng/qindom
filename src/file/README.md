## File Controller

- Controller for uploading and deleting image file blobs associated with itinerary agenda items
- Accepted types: JPEG, PNG, GIF, WebP, SVG — max 5 MB per file
------------------------------------------------------------------------------------------

#### Upload a file blob

<details>
 <summary><code>POST</code> <code>/api/file</code></summary>

##### Payload Format
```
{
    "uuid": string,         // client-generated UUID for the file
    "agendaId": number,     // ID of the agenda item this file belongs to
    "name": string,         // optional, original filename
    "mimeType": string,     // required — one of: image/jpeg, image/png, image/gif, image/webp, image/svg+xml
    "sizeInBytes": number,  // optional
    "blob": string          // required, base64-encoded image data (max 5 MB)
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": {
        "id": number,
        "uuid": string
    } | string
}
```
</details>

------------------------------------------------------------------------------------------

#### Soft-delete files by UUID

<details>
 <summary><code>POST</code> <code>/api/file/delete</code></summary>

##### Payload Format
```
{
    "_fileIdsToDelete": string[]   // array of file UUIDs to soft-delete
}
```

##### Response Format
```
{
    "code": 200 | 400 | 500,
    "status": "Ok" | "Ko",
    "data": { "deleted": number } | string   // count of deleted files
}
```
</details>

------------------------------------------------------------------------------------------
