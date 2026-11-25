## Geocode Controller

- Place search via Nominatim (OpenStreetMap). **Public** (`mw.std`).
- Results are cached in `tb_geocode_cache` per normalised (trimmed, lower-cased) query, including empty results. Failed fetches are never cached (there's no TTL).
- Nominatim allows 1 req/s: cache misses go through one in-memory queue (≥1.1 s apart, at most 5 waiting; more → 502). Single PM2 process only.

---

#### Search for a location

<details>
 <summary><code>GET</code> <code>/geocode?q=</code></summary>

##### Query parameters
- `q`: required, 1–200 characters after trimming, e.g. `Marina Bay Sands, Singapore`.

##### Response: `NominatimPlaceDto[]` (`Geocode.types.ts`)
Up to 10 Nominatim results, passed through unchanged. Fields fndom reads:

```
{
  "code": 200,
  "status": "Ok",
  "data": [
    {
      "place_id": number,
      "osm_id": number,
      "lat": string,
      "lon": string,
      "display_name": string,
      "type": string,
      "address": { "country": string, "country_code": string, ... },
      ...other Nominatim fields
    }
  ]
}
```

##### Errors
| Status | When | `data.code` |
|---|---|---|
| 400 | `q` missing, blank or > 200 chars | `invalid_request_q` |
| 502 | Nominatim failed, or the queue is full | `external_request_exception` |
</details>
