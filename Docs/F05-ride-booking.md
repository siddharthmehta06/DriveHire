# F05 — Ride Booking, Booking List & Tracking

- **SRS:** Section 4.4, REQ-4.4.3–4.4.6 · **Priority:** High
- **Depends on:** F04 (F06 plugs in for receipts) · **Class diagram:** `Booking`, `RideBooking` (createBooking), `RideController` (requestBooking, acceptRequest, rejectRequest), `User` (viewBookingHistory, trackRide)
- **Follow:** AGENTS.md.

## 1. Goal
Passengers request seats, drivers accept or reject, accepted seats are locked so the ride can never be overbooked. Users see upcoming, active and past rides, and track a live ride.

## 2. Scope
**In:** booking base table, request/accept/reject/cancel, ride start and complete, booking list, live location tracking, notifications.
**Out:** payment and receipt generation (F06; this feature only emits `booking.completed` and links to the receipt endpoint), rentals (F07).

## 3. Data model
```prisma
enum BookingType   { RIDE RENTAL }
enum BookingStatus { PENDING ACCEPTED CONFIRMED REJECTED CANCELLED ACTIVE COMPLETED }

model Booking {
  id String @id @default(uuid())
  userId String
  type BookingType
  status BookingStatus @default(PENDING)
  bookingDate DateTime @default(now())
  cancelledAt DateTime?
  cancelReason String?
  updatedAt DateTime @updatedAt
  rideBooking RideBooking?
  @@index([userId, status])
  @@map("bookings")
}
model RideBooking {
  bookingId String @id
  booking Booking @relation(fields: [bookingId], references: [id])
  rideId String
  passengerId String
  seatsBooked Int
  pickupNote String?
  active Boolean @default(true)       // false once rejected, cancelled or completed
  @@index([rideId])
  @@map("ride_bookings")
}
model RideLocation {                    // latest position only
  rideId String @id
  lat Decimal @db.Decimal(9,6)
  lng Decimal @db.Decimal(9,6)
  updatedAt DateTime @updatedAt
  @@map("ride_locations")
}
```
Raw-SQL: partial unique index `UNIQUE (ride_id, passenger_id) WHERE active`, and `CHECK (seats_booked BETWEEN 1 AND 6)`. (`CONFIRMED` is used by rentals in F07.)

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `POST /api/rides/:id/bookings` | USER, DRIVER (not the ride's driver) | `{ seatsBooked, pickupNote? }` → PENDING. Does not consume seats |
| `POST /api/bookings/:id/accept` | ride's driver | locks seats atomically (below) |
| `POST /api/bookings/:id/reject` | ride's driver | optional reason |
| `POST /api/bookings/:id/cancel` | passenger | ACCEPTED or PENDING; allowed until `PASSENGER_CANCEL_CUTOFF_MIN` (60) before departure; returns seats |
| `POST /api/rides/:id/start` · `/complete` | ride's driver | OPEN/FULL → IN_PROGRESS → COMPLETED; ACCEPTED bookings → ACTIVE → COMPLETED; emits `booking.completed` per booking |
| `GET /api/bookings/mine` | self | `bucket=upcoming\|active\|past`, `type` filter, paginated |
| `GET /api/rides/:id/bookings` | ride's driver | requests and accepted passengers |
| `GET /api/driver/requests?status=PENDING` | DRIVER | incoming requests across rides |
| `POST /api/rides/:id/location` | ride's driver | `{ lat, lng }` upserts `RideLocation`, emits `ride:location` |
| `GET /api/rides/:id/location` | driver, passengers with ACCEPTED/ACTIVE booking | latest position |

**Atomic accept (REQ-4.4.4):** inside one transaction run
`UPDATE carpool_rides SET available_seats = available_seats - $n, status = CASE WHEN available_seats - $n = 0 THEN 'FULL' ELSE status END WHERE id = $id AND status = 'OPEN' AND available_seats >= $n RETURNING *`.
Zero rows → 409 `SEATS_UNAVAILABLE`; the booking stays PENDING so the driver can reject it. Only after success set the booking ACCEPTED. Call F04's `publishRideSeats`.

Buckets: **upcoming** = PENDING/ACCEPTED/CONFIRMED with a future departure · **active** = ACTIVE · **past** = COMPLETED, CANCELLED, REJECTED, or departure passed without activity.

Socket rules: a client may join `ride:<id>` only as the ride's driver or as a passenger with an ACCEPTED/ACTIVE booking. Emit `booking:updated` to `user:<id>` on every status change.

## 5. UI
Passenger: seat-request modal on `RideDetailPage` · `MyBookingsPage` (Upcoming / Active / Past tabs; receipt button disabled until a payment exists) · `TrackRidePage` (Leaflet map with live marker via socket).
Driver: `RideRequestsPage` (accept/reject) · `DriverRideManagePage` (start, complete, "share my location" using `watchPosition`, throttled to one update per 5 s).

## 6. Business rules & edge cases
- A passenger cannot request their own ride, a non-OPEN ride, a past ride, or a ride they already have an active request on (409 `DUPLICATE_REQUEST`).
- Cancelling an ACCEPTED booking adds seats back and moves a FULL ride to OPEN, in one transaction.
- Handle `ride.cancelled` (from F04): PENDING and ACCEPTED bookings → CANCELLED, notify every passenger.
- Register a commitment check with F01 only if F04 has not covered it; do not duplicate.
- Notifications via F02: BOOKING_REQUESTED (driver), BOOKING_ACCEPTED/REJECTED/CANCELLED (passenger).

## 7. Phases
### Phase 1 — Data layer
Tasks: models, migration with partial unique index and CHECKs.
Done when: duplicate active requests are rejected by the database.

### Phase 2 — Request, accept, reject, cancel
Tasks: services with the atomic seat lock, cancellation cutoff, event handling, notifications.
Done when: a concurrency test with 10 parallel accepts on a 2-seat ride yields exactly 2 successes and `available_seats = 0`.

### Phase 3 — Ride lifecycle & booking lists
Tasks: start, complete, `bookings/mine` buckets, driver endpoints, `booking.completed` event.
Done when: bucket classification matches section 4 for every status.

### Phase 4 — Live tracking
Tasks: location endpoints, room authorization, `ride:location` events.
Done when: only authorized users receive location updates; unauthorized joins are rejected.

### Phase 5 — UI, tests, feature review
Tasks: all pages above; API, concurrency and socket tests; UI smoke test; full review plus section 8.

## 8. Feature-specific review checklist
- Can seats ever go negative or exceed `total_seats` under concurrency?
- Does every status transition check the caller's role and the current status?
- Can a user learn another passenger's booking or location?
- Is seat restoration on cancel exactly once (no double refund of seats)?
- Is the cancellation cutoff enforced server-side?

## 9. Definition of Done
REQ-4.4.3–4.4.6 met (receipt link wired in F06) · concurrency test passes · logs and status updated.
