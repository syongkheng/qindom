## File Controller

- Soft-deletes agenda-item file records (`tb_travel_agenda_file`). Files are **created by the itinerary save** (`_filesToInsert` in `POST /itinerary` / `POST /itinerary/:sessionId/update`), after the image itself is uploaded to `/img/upload`.
- **Auth:** JWT (`mw.auth`). Only files on itineraries the caller created are affected.

---

#### Soft-delete files by UUID

<details>
 <summary><code>POST</code> <code>/file/delete</code></summary>

##### Body: `FileDeleteBody`

```
{ "_fileIdsToDelete": string[] }   // 1–100 file UUIDs (field name kept as fndom sends it)
```

##### Response: `FileDeletedDto`

```
{ "code": 200, "status": "Ok", "data": { "deleted": number } }
```

`deleted` counts rows actually soft-deleted. Unknown, already-deleted or other users' UUIDs are skipped silently, not counted, and don't cause an error.

##### Errors

| Status | When                                             | `data.code`                        |
| ------ | ------------------------------------------------ | ---------------------------------- |
| 400    | missing, empty, > 100 items, or non-string items | `invalid_request__fileIdsToDelete` |
| 401    | not logged in                                    | (TokenFilter `token_invalid`)      |

</details>

> `POST /file/tg` was removed in Nov 2026: nothing called it (linking happens in the itinerary save).
