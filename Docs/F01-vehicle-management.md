# F01 — Vehicle Management

- **SRS:** Section 4.1, REQ-4.1.1, REQ-4.1.2, REQ-4.1.3 · **Priority:** High
- **Depends on:** auth (assumed) · **Class diagram:** `Vehicle` (createVehicle, updateDetails, checkAvailability, updateAvailability, setVerificationStatus)
- **Follow:** AGENTS.md (phase protocol, review, logging). Read it first.

## 1. Goal
Drivers and owners register vehicles, then view, edit and track them from a dashboard. Each vehicle is a unique record linked to its owner. This is the foundation for every later feature.

## 2. Scope
**In:** vehicle CRUD, photo upload, availability toggle, owner dashboard, project foundation (first feature, so it also bootstraps shared server code).
**Out:** documents (F02), verification logic (F03), rides (F04), rental listing (F07).

## 3. Data model
```prisma
enum VehicleType { HATCHBACK SEDAN SUV MPV LUXURY }
enum VerificationStatus { UNVERIFIED UNDER_REVIEW VERIFIED REJECTED EXPIRED }

model Vehicle {
  id                 String   @id @default(uuid())
  ownerId            String
  owner              User     @relation(fields: [ownerId], references: [id])
  make               String
  model              String
  year               Int
  registrationNumber String   @unique   // normalised: uppercase, no spaces/hyphens
  vehicleType        VehicleType
  seatCapacity       Int                // passenger seats, excluding driver
  photoUrls          String[]
  verificationStatus VerificationStatus @default(UNVERIFIED)
  isAvailable        Boolean  @default(true)
  deletedAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([ownerId])
  @@map("vehicles")
}
```
Add a CHECK via raw migration: `seat_capacity BETWEEN 1 AND 8` and `year BETWEEN 1990 AND extract(year from now())+1`.

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `POST /api/vehicles` | USER, DRIVER | multipart: fields + `photos[]` (max 5, jpg/png/webp, ≤5 MB each). 409 `REGISTRATION_EXISTS` if duplicate |
| `GET /api/vehicles` | owner | own vehicles; filters `verificationStatus`, `isAvailable`; paginated |
| `GET /api/vehicles/:id` | owner, ADMIN | 404 for anyone else |
| `PATCH /api/vehicles/:id` | owner | make, model, year, vehicleType, seatCapacity, add/remove photos. `registrationNumber` and `verificationStatus` are NOT editable |
| `PATCH /api/vehicles/:id/availability` | owner | `{ isAvailable }` |
| `DELETE /api/vehicles/:id` | owner | soft delete; 409 `VEHICLE_HAS_COMMITMENTS` if any registered commitment check returns true |

Internal service exports (`modules/vehicles/service.js`): `getVehicleForOwner(id, userId)`, `setVerificationStatus(id, status)` (called only by F03, emits `vehicle.verification-changed`), `updateAvailability`, `checkAvailability`, `registerCommitmentCheck(fn)`.

## 5. UI
`VehicleListPage` (cards with status badge: grey Unverified, amber Under review, green Verified, red Rejected/Expired) · `VehicleFormPage` (create/edit, photo previews) · `VehicleDetailPage` (details, availability switch, placeholder slot for documents/verification added later). After any mutation, refetch so the dashboard reflects changes immediately.

## 6. Business rules & edge cases
- Normalise `registrationNumber` before the uniqueness check.
- A vehicle is only visible to its owner and ADMIN.
- Deleting a vehicle never deletes its history; use soft delete and exclude deleted rows everywhere.
- Photos are stored under `server/uploads/vehicles/<ownerId>/`; delete files when a photo is removed.
- `verificationStatus` is written only by `setVerificationStatus`.

## 7. Phases
### Phase 1 — Foundation & data layer
Tasks: if missing, bootstrap Express app, `lib/{prisma,errors,response,validate,events,logger}`, error-handler middleware, `docker-compose.yml` (postgres, postgres-test, api, client), Jest + Supertest config using the test DB, `GET /api/health`; add the Vehicle model, enums, migration (with CHECKs), seed with 2 sample vehicles.
Done when: `docker compose up` starts all services; `prisma migrate reset` applies cleanly; `npm test` runs a passing health test.

### Phase 2 — API
Tasks: Zod schemas, upload middleware (type and size limits, random filenames), service, controller, routes per section 4; commitment-check registry.
Done when: all endpoints behave per contract; non-owner gets 404; duplicate registration returns 409.

### Phase 3 — UI
Tasks: the three pages, routes under `ProtectedRoute roles=[USER,DRIVER]`, API module, form validation mirroring Zod rules, loading/empty/error states.
Done when: an owner can register, edit, toggle availability and delete from the browser.

### Phase 4 — Tests, hardening, feature review
Tasks: API tests (create, duplicate, ownership/IDOR, mass-assignment of `verificationStatus`, invalid uploads, delete with and without commitments); one UI smoke test; run the full checklist plus section 8.
Done when: Definition of Done below is satisfied.

## 8. Feature-specific review checklist
- Can a user set `verificationStatus` or `ownerId` through any body field? (must be no)
- Is a duplicate registration number blocked case/space-insensitively?
- Can user B read, edit, or delete user A's vehicle by guessing the id?
- Are orphaned photo files cleaned up?
- Are soft-deleted vehicles excluded from every query?

## 9. Definition of Done
REQ-4.1.1–4.1.3 demonstrably met · all tests green · lint clean · seed works · README status updated · both logs have entries for every phase.
