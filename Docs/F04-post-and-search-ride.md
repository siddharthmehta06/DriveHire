# F04 — Post Ride & Search Ride

- **SRS:** Section 4.4, REQ-4.4.1, REQ-4.4.2; 2.5 (real-time sync) · **Priority:** High
- **Depends on:** F01, F03 · **Class diagram:** `CarpoolRide` (createRide, matchesSearch, checkAvailability, updateAvailableSeats), `RideController.searchRide`, `Driver.postRide`
- **Follow:** AGENTS.md.

## 1. Goal
Approved drivers publish rides with route, seats and per-seat cost. Passengers search and filter active rides by destination and time. Also sets up the real-time layer used by F05.

## 2. Scope
**In:** post, search, detail, my rides, cancel ride, Socket.IO foundation, map components.
**Out:** booking requests, accept/reject, start/complete, tracking (F05); payment (F06).

## 3. Data model
```prisma
enum RideStatus { OPEN FULL IN_PROGRESS COMPLETED CANCELLED }
model CarpoolRide {
  id String @id @default(uuid())
  driverId String
  vehicleId String
  originText String
  originLat Decimal @db.Decimal(9,6)
  originLng Decimal @db.Decimal(9,6)
  destText String
  destLat Decimal @db.Decimal(9,6)
  destLng Decimal @db.Decimal(9,6)
  distanceKm Decimal? @db.Decimal(7,2)
  departureTime DateTime
  totalSeats Int
  availableSeats Int
  costPerSeat Decimal @db.Decimal(10,2)
  notes String?
  status RideStatus @default(OPEN)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([status, departureTime]) @@index([driverId])
  @@map("carpool_rides")
}
```
Raw-SQL CHECKs: `available_seats BETWEEN 0 AND total_seats`, `cost_per_seat >= 0`, `total_seats >= 1`. Optional `pg_trgm` GIN indexes on `origin_text`, `dest_text`.

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `POST /api/rides` | DRIVER | calls `assertDriverApproved` and `assertVehicleVerified`; vehicle must be owned by the caller and `isAvailable` |
| `GET /api/rides` | any authenticated | search: `destination`, `origin`, `date`, `timeFrom`, `timeTo`, `seats`, `maxPrice`, optional `lat/lng/radiusKm` (haversine, default 10 km), `sort=time\|price`, pagination |
| `GET /api/rides/:id` | any authenticated | detail incl. driver first name and rating placeholder, vehicle make/model; never email or phone |
| `GET /api/rides/mine` | DRIVER | own rides, status filter |
| `PATCH /api/rides/:id/cancel` | owner driver | allowed for OPEN/FULL; emits `ride.cancelled` (F05 handles bookings) |

Search returns only `status = OPEN`, `availableSeats >= seats` (default 1), departure in the future.

Real-time (`lib/realtime.js`): Socket.IO on the HTTP server, JWT checked in the handshake, rooms `user:<id>` and `ride:<id>`; exports `emitToRide(rideId, event, payload)` and `emitToUser(userId, event, payload)`. This feature emits `ride:seats-updated { rideId, availableSeats, status }` whenever seats or status change (call a single `publishRideSeats(ride)` helper).

## 5. UI
`PostRidePage` (form plus `RouteMap` — pick origin and destination on the map, optional reverse-geocoding via Nominatim, debounced, max 1 request/second, graceful fallback to text only) · `SearchRidesPage` (filters, results list, map markers, live seat counts via socket) · `RideDetailPage` · `MyRidesPage` (driver). Components: `RouteMap`, `RideCard`, `SeatBadge`.

## 6. Business rules & edge cases
- `departureTime` ≥ now + 30 min. `totalSeats` ≤ vehicle `seatCapacity`. `costPerSeat` 0–10000.
- Same vehicle cannot have another OPEN/IN_PROGRESS ride within ±3 hours (constant `RIDE_VEHICLE_GAP_HOURS`).
- Register a commitment check with F01: a vehicle with a future OPEN/FULL/IN_PROGRESS ride cannot be deleted.
- Never trust client-provided `availableSeats`; set it equal to `totalSeats` on create.
- Search must use parameterized queries; escape `%` and `_` in ILIKE input.

## 7. Phases
### Phase 1 — Data layer
Tasks: model, migration with CHECKs and indexes, seed 3 rides.
Done when: constraints reject invalid seat and cost values at the database level.

### Phase 2 — Post, detail, my rides, cancel API
Tasks: schemas, service, controller, routes; guards; commitment check; `ride.cancelled` event.
Done when: unverified vehicle or unapproved driver gets 422; non-owner cannot cancel.

### Phase 3 — Search API & real-time foundation
Tasks: search with all filters and radius; `lib/realtime.js` with authenticated sockets and rooms; `publishRideSeats`.
Done when: search tests cover each filter and combination; a socket test receives `ride:seats-updated`.

### Phase 4 — UI, tests, feature review
Tasks: the four pages and map components; API and socket tests; UI smoke test; full review plus section 8.

## 8. Feature-specific review checklist
- Is the search SQL injection-safe, including wildcard characters?
- Can unverified vehicles or unapproved drivers ever post (including by direct API call)?
- Do socket connections without a valid token get rejected, and can a user join only allowed rooms?
- Does search leak driver contact details?
- Are results bounded by pagination and served by an index?

## 9. Definition of Done
REQ-4.4.1–4.4.2 met · real-time seat events working · tests green · logs and status updated.
