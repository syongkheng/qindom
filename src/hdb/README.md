# HDB `/hdb`

PPHS (Parenthood Provisional Housing Scheme) flats scraped from the HDB website, their map coordinates, and nearby bus stops / MRT stations. Mounted under `mw.std`: reads are public; the coordinate admin routes add `MandatoryTokenFilter` per route plus a `PPHS_R5` or `SYSTEM_R5` role check (`requireRole`).

| File                                                | Role                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Hdb.controller.ts`                                 | routes                                                                                    |
| `Hdb.service.ts`                                    | `HdbService`: PPHS list (owns `tb_hdb_pphs`), nearby transport via `LtaService`           |
| `HdbCoordinate.service.ts`                          | `HdbCoordinateService`: geocoding cache + admin overrides (owns `tb_hdb_pphs_coordinate`) |
| `HdbPphs.parser.ts`                                 | pure HDB page → `PphsRecord[]` parser (null when the page layout changed)                 |
| `Hdb.validator.ts` / `Hdb.types.ts` / `Hdb.test.ts` | validation, DTOs, tests                                                                   |

Errors use the standard body `data = { code, message, fieldName, typeOfError, timestamp }`. Invalid input → 400 `invalid_request_<field>`.

## Public reads

### `GET /hdb/pphs?batch=YYYYMM`

`batch` is optional (default: the current batch = the latest even month in Singapore, e.g. Nov 2026 → `202610`, Jan 2027 → `202612`; same rule as fndom's batch switcher default). A stored batch is served from `tb_hdb_pphs`. Only the **current** batch is scraped from the HDB page and stored when missing (the page always shows today's flats, so storing it under another month would be wrong); any other unstored batch → 404, with no outbound call. Each record's coordinates come from `HdbCoordinateService.resolve` (DB cache → OneMap → Nominatim).

```
data: {
  records: [{
    town: string, address: string,
    flatTypes: { "2-room"?: string, "3-room"?: string, "4-room"?: string },  // unit counts; "-" types omitted
    siteExpiry: string,
    lat: string, lng: string, formedUrl: string,      // all "" when there are no coordinates
    source: "database" | "onemap" | "nominatim" | "error" | "unparseable"
  }]
}
```

Errors: 400 `invalid_request_batch` (not `YYYYMM` with month 01–12); 404 `entity_not_found` ("Batch not found": not stored and not the current batch); 502 `external_request_exception` (HDB site unreachable or its layout changed).

### `GET /hdb/pphs/busstops?lat=&lng=&radius=`

`lat` (±90) and `lng` (±180) as decimals; `radius` whole metres, 0–5000.

```
data: { busStops: [{ busStopCode, roadName, description, distanceM }], count }
```

`busStops` = nearest first, at most 10 (`NEARBY_BUS_STOPS_MAX_ROWS`); `count` = all stops inside the radius. `distanceM` is whole metres.

### `GET /hdb/pphs/mrt?lat=&lng=&limit=`

`limit` optional, 1–10, default 3.

```
data: { stations: [{ station, type: "MRT" | "LRT", distanceM }], count }
```

## Coordinate admin (JWT cookie + CSRF header, `PPHS_R5` or `SYSTEM_R5`)

No cookie / invalid session → 401 `token_invalid`; logged in without the role → 403 `forbidden_access`.
`address` is the record's address (≤ 1024 chars, trimmed); the cache key is the address with whitespace runs → `+`.

| Route                              | Body                                                                                                                                      | `data`                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /hdb/pphs/update`            | `{ address, lat, lng }`: lat/lng numbers or decimal strings (stored with ≤ 8 decimals). A `formedUrl` in the body is accepted but ignored | `{ lat, lng, formedUrl, updated, created }`: upsert; `formedUrl` built by the server from lat/lng; `updated` = rows overwritten, or 1 with `created: true` when the address had no cached row (inserted with the same key, `created_by`/`modified_by` = admin). The table has no source column, so the point reads back as `source: "database"` |
| `POST /hdb/pphs/clear-coordinates` | `{ address }`                                                                                                                             | `{ cleared: true }`: cache replaced by a blank row (off the map, not re-geocoded)                                                                                                                                                                                                                                                               |
| `POST /hdb/pphs/geocode-options`   | `{ address }`                                                                                                                             | `[{ source: "onemap" \| "nominatim", lat, lng, formedUrl }]`, live, not cached; `[]` if neither finds it                                                                                                                                                                                                                                        |
| `POST /hdb/pphs/refresh`           | `{ address }`                                                                                                                             | `{ lat, lng, formedUrl, source }`: cache dropped and re-geocoded                                                                                                                                                                                                                                                                                |

`geocode-options` is a read but stays POST on purpose: `MandatoryTokenFilter` checks CSRF only on non-GET requests, and this route makes outbound OneMap/Nominatim calls for an admin session.

## Geocoding

- OneMap (SLA search API, no key) first, 300 ms pause before each call.
- Nominatim fallback through `geocode`'s shared 1 req/s queue (`searchNominatim`, max 5 waiting, `countrycodes=sg`, `limit=1`). Uncached here (the hit goes into `tb_hdb_pphs_coordinate`).
- A geocoder failure → that source is skipped; both failing → `source: "error"` (not cached, retried next time). Multi-block addresses (`&`) are cached blank (`unparseable`).
