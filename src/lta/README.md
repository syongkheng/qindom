## LTA Controller

- Public transport data. **Auth:** none (`mw.std`).
- `LtaService` owns `tb_lta_busstop`, `tb_lta_bus_info` and `tb_lrt_mrt_station` (static LTA data, loaded once; no write routes).
- Env: `LTA_DATAMALL_API_KEY` (read lazily; missing = 500 + server log).
- `tb_lrt_mrt_station` stores latitude in `lng` and longitude in `lat`; the MRT query's `POINT(e.lat, e.lng)` compensates on purpose. See the comment in `Lta.service.ts`.

---

| Method | Path                        | Query                    | Response (`data`)                                                     |
| ------ | --------------------------- | ------------------------ | --------------------------------------------------------------------- |
| `GET`  | `/lta/timing`               | `busStopCode` (5 digits) | `BusArrivalsDto` `{ records: BusArrivalServiceDto[] }`                |
| `GET`  | `/lta/bus/services`         | `busStopCode` (5 digits) | `BusServicesDto` `{ services: BusServiceDto[], count }`               |
| `GET`  | `/lta/bus-stops/nearby`     | `lat`, `lng`, `radius`   | `NearbyBusStopsDto` `{ busStops: NearbyBusStopDto[], count }`         |
| `GET`  | `/lta/mrt-stations/nearest` | `lat`, `lng`, `limit?`   | `NearestMrtStationsDto` `{ stations: NearestMrtStationDto[], count }` |

`BusArrivalServiceDto` is LTA DataMall's BusArrival v3 `Services[]` item, passed through unchanged (PascalCase is DataMall's):
`{ ServiceNo, Operator, NextBus, NextBus2, NextBus3, … }`, each `NextBus*` = `{ EstimatedArrival, Load, Feature, Type, … }` (all `""` when there is no estimate). Only the fields fndom reads are typed.

`BusServiceDto` = `{ serviceNo, operator, direction, stopSequence, distance, weekdayFirstBus, weekdayLastBus, saturdayFirstBus, saturdayLastBus, sundayFirstBus, sundayLastBus }`, all strings as stored (times `"HHmm"`, `"-"` = no service), ordered by service number (13, 13A, 50).

### Nearby bus stops / MRT stations

Used by fndom's `/bus` page and the `/flat` analysis card (moved here from the removed `/hdb/pphs/busstops` and `/hdb/pphs/mrt`, same shapes and limits).

- `lat` (±90) and `lng` (±180): plain decimals (`1.3521`; no `1e3` / `Infinity`). `radius`: whole metres, 0–5000. `limit`: optional, 1–10, default 3.
- `NearbyBusStopDto` = `{ busStopCode, roadName, description, distanceM }`: nearest first, at most 10 (`NEARBY_BUS_STOPS_MAX_ROWS`); `count` = every stop inside the radius, before the cap.
- `NearestMrtStationDto` = `{ station, type: "MRT" | "LRT", distanceM }`: one row per station, measured to its closest exit; `count` = rows returned.
- `distanceM` is whole metres. Text fields are `null` when the stored column is.

##### Errors

| Status | When                                                               | `data.code`                   |
| ------ | ------------------------------------------------------------------ | ----------------------------- |
| 400    | missing / malformed `busStopCode`                                  | `invalid_request_busStopCode` |
| 400    | missing / malformed / out-of-range `lat`, `lng`, `radius`, `limit` | `invalid_request_<field>`     |
| 500    | `LTA_DATAMALL_API_KEY` not configured (`/timing`)                  | `unknown`                     |
| 502    | DataMall unreachable, non-OK status or unreadable body (`/timing`) | `external_request_exception`  |
