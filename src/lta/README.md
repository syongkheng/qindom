## LTA Controller

- Public bus data. **Auth:** none (`mw.std`).
- `LtaService` owns `tb_lta_busstop`, `tb_lta_bus_info` and `tb_lrt_mrt_station` (static LTA data, loaded once; no write routes). It also serves the proximity lookups behind `GET /hdb/pphs/busstops` and `GET /hdb/pphs/mrt` (`findBusStopsNear`, `findNearestMrtStations` return raw rows; hdb maps them to its camelCase DTOs).
- Env: `LTA_DATAMALL_API_KEY` (read lazily; missing = 500 + server log).
- `tb_lrt_mrt_station` stores latitude in `lng` and longitude in `lat`; the MRT query's `POINT(e.lat, e.lng)` compensates on purpose. See the comment in `Lta.service.ts`.

---

| Method | Path                | Query                    | Response (`data`)                                       |
| ------ | ------------------- | ------------------------ | ------------------------------------------------------- |
| `GET`  | `/lta/timing`       | `busStopCode` (5 digits) | `BusArrivalsDto` `{ records: BusArrivalServiceDto[] }`  |
| `GET`  | `/lta/bus/services` | `busStopCode` (5 digits) | `BusServicesDto` `{ services: BusServiceDto[], count }` |

`BusArrivalServiceDto` is LTA DataMall's BusArrival v3 `Services[]` item, passed through unchanged (PascalCase is DataMall's):
`{ ServiceNo, Operator, NextBus, NextBus2, NextBus3, … }`, each `NextBus*` = `{ EstimatedArrival, Load, Feature, Type, … }` (all `""` when there is no estimate). Only the fields fndom reads are typed.

`BusServiceDto` = `{ serviceNo, operator, direction, stopSequence, distance, weekdayFirstBus, weekdayLastBus, saturdayFirstBus, saturdayLastBus, sundayFirstBus, sundayLastBus }`, all strings as stored (times `"HHmm"`, `"-"` = no service), ordered by service number (13, 13A, 50).

##### Errors

| Status | When                                                               | `data.code`                   |
| ------ | ------------------------------------------------------------------ | ----------------------------- |
| 400    | missing / malformed `busStopCode`                                  | `invalid_request_busStopCode` |
| 500    | `LTA_DATAMALL_API_KEY` not configured (`/timing`)                  | `unknown`                     |
| 502    | DataMall unreachable, non-OK status or unreadable body (`/timing`) | `external_request_exception`  |
