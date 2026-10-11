# F07 — P2P Listing & Hourly/Daily Rental

- **SRS:** Section 4.5 REQ-4.5.1–4.5.2, Section 4.6 REQ-4.6.1–4.6.3 · **Priority:** Medium
- **Depends on:** F03, F05, F06 · **Class diagram:** `User.listPersonalCar`, `RentalBooking` (createBooking, checkOverlap, calculateCost), `RentalController` (browseVehicles, selectVehicle, confirmBooking), `Vehicle.checkAvailability`
- **Follow:** AGENTS.md.

## 1. Goal
Verified owners list their cars for rent. Renters browse available vehicles and book them hourly or daily, with dynamic pricing and a guarantee that a vehicle can never be double-booked.

## 2. Scope
**In:** rental listings, admin rental rates by vehicle type, browse, quote, booking, handover (start) and return (complete), cancellation, payment hook.
**Out:** earnings reports and cash-out (F08), refunds, damage/deposit handling.

## 3. Data model
```prisma
enum ListingStatus { ACTIVE PAUSED }
enum DurationType  { HOURLY DAILY }

model RentalListing {
  id String @id @default(uuid())
  vehicleId String @unique
  ownerId String
  description String?
  pickupText String
  pickupLat Decimal @db.Decimal(9,6)
  pickupLng Decimal @db.Decimal(9,6)
  availableFrom DateTime?
  availableTo DateTime?
  status ListingStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("rental_listings")
}
model RentalRate {                               // admin-managed, one row per vehicle type
  id String @id @default(uuid())
  vehicleType VehicleType @unique
  hourlyRate Decimal @db.Decimal(10,2)
  dailyRate Decimal @db.Decimal(10,2)
  updatedById String?
  updatedAt DateTime @updatedAt
  @@map("rental_rates")
}
model RentalBooking {
  bookingId String @id
  booking Booking @relation(fields: [bookingId], references: [id])
  vehicleId String
  listingId String
  renterId String
  startTime DateTime
  endTime DateTime
  durationType DurationType
  quantity Int                                   // hours or days
  rateSnapshot Decimal @db.Decimal(10,2)         // rate used at booking time
  totalCost Decimal @db.Decimal(10,2)
  active Boolean @default(true)
  @@index([vehicleId, startTime])
  @@map("rental_bookings")
}
```
**Overlap guard (REQ-4.6.3), hand-written migration:** enable `btree_gist`; add generated column `period tstzrange GENERATED ALWAYS AS (tstzrange(start_time, end_time, '[)')) STORED`; add `EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (active)`. Catch Postgres error `23P01` and return 409 `VEHICLE_ALREADY_BOOKED`. Seed `rental_rates` for every vehicle type.

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `GET/PUT /api/admin/rental-rates` | ADMIN | per vehicle type |
| `POST /api/listings` | vehicle owner | `assertVehicleVerified`; one listing per vehicle |
| `GET /api/listings/mine` · `PATCH /api/listings/:id` | owner | pause, resume, edit window and pickup |
| `DELETE /api/listings/:id` | owner | 409 if future bookings exist |
| `GET /api/rentals/vehicles` | any authenticated | filters `from`, `to`, `vehicleType`, `maxHourly`, `lat/lng/radiusKm`; excludes vehicles with overlapping active bookings or overlapping carpool rides; shows availability and price estimate |
| `POST /api/rentals/quote` | any authenticated | `{ vehicleId, startTime, endTime, durationType }` → cost breakdown |
| `POST /api/rentals` | renter | creates `Booking(type=RENTAL, status=CONFIRMED)` + `RentalBooking` in one transaction |
| `POST /api/rentals/:bookingId/start` · `/complete` | owner | CONFIRMED → ACTIVE → COMPLETED; complete emits `booking.completed` |
| `POST /api/rentals/:bookingId/cancel` | renter | CONFIRMED only, at least 2 hours before start (`RENTAL_CANCEL_CUTOFF_HOURS`) |

Extend F05's `bookings/mine` with a rental serializer (type filter already exists). Register `registerAmountStrategy('RENTAL', booking => totalCost)` with F06.

## 5. UI
Owner: `ListCarPage`, `MyListingsPage` (pause/resume, availability window). Renter: `BrowseRentalsPage` (date-time range, filters, map), `RentalDetailPage` (quote and confirm), rental entries in `MyBookingsPage`. Admin: `RentalRatesPage`. Owner actions "Hand over" and "Mark returned" in the owner's bookings view.

## 6. Business rules & edge cases
- **Cost:** HOURLY = ceil(hours) × hourlyRate, 1–23 hours. DAILY = ceil(hours / 24) × dailyRate, 1–30 days. Rate comes from `RentalRate` by `vehicleType`, snapshotted on the booking.
- Start ≥ now + 30 min; end > start; the window must fit inside the listing's availability window if set.
- A renter cannot rent their own car. Vehicle must be VERIFIED, `isAvailable`, and the listing ACTIVE; re-check on booking (state may have changed since browse).
- A vehicle cannot be rented while it has an overlapping OPEN/FULL/IN_PROGRESS carpool ride (±`RIDE_VEHICLE_GAP_HOURS`), and F04's ride creation must symmetrically reject overlapping rentals. Implement through one shared helper, not two copies.
- Register a commitment check with F01 so vehicles with future rentals cannot be deleted.
- Payment follows completion (same as rides, SRS 4.7); the renter is the payer, the owner is the payee.

## 7. Phases
### Phase 1 — Data layer & admin rates
Tasks: models, migration with `btree_gist` exclusion constraint, rate seed, admin rates endpoints.
Done when: inserting two overlapping active bookings fails at the database; cancelled bookings (`active = false`) no longer block.

### Phase 2 — Owner listings
Tasks: listing CRUD with `assertVehicleVerified`, pause/resume, commitment check.
Done when: unverified vehicles cannot be listed (REQ-4.5.1).

### Phase 3 — Browse, quote & book
Tasks: browse query with availability exclusion, quote engine (pure function with unit tests), booking transaction with 409 mapping, cross-feature ride/rental conflict helper.
Done when: 10 parallel bookings for the same slot yield exactly one success.

### Phase 4 — Lifecycle & payment integration
Tasks: start, complete, cancel, notifications, `booking.completed` event, RENTAL amount strategy, extend booking list serializer.
Done when: completing a rental creates the correct Payment through F06.

### Phase 5 — UI, tests, feature review
Tasks: all pages; tests for cost rounding, boundaries (23 h vs 24 h), overlap, cutoffs, IDOR; UI smoke test; full review plus section 8.

## 8. Feature-specific review checklist
- Is overlap prevented by the database, not only by application code?
- Are half-open ranges respected (back-to-back bookings allowed)?
- Does the quote match the booked cost exactly (shared function)?
- Are time zones handled (UTC storage, IST display)?
- Can ride and rental commitments on one vehicle collide?

## 9. Definition of Done
REQ-4.5.1–4.5.2 and REQ-4.6.1–4.6.3 met · concurrency test passes · logs and status updated.
