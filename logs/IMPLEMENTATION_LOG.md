# Implementation Log

## IMP-001 | F01 | Phase 1-2 | 2026-10-11
**Summary:** Scaffolding for the vehicle management feature includes a health endpoint, vehicle service, validation, upload handling, and owner-scoped CRUD routes with soft-delete behavior and duplicate registration prevention.
**Files added/changed:** package.json, .env.example, prisma/schema.prisma, server/src/app.js, server/src/server.js, server/src/lib/*.js, server/src/middleware/*.js, server/src/modules/vehicles/*.js, server/src/prisma/seed.js, server/src/modules/vehicles/__tests__/vehicle.integration.test.js
**Decisions:** Use SQLite in local development for fast validation while keeping the schema and route contracts aligned with the F01 API design; normalize registration numbers before uniqueness checks and enforce owner-only access with 404 masking.
**Tests:** npm test -- --runInBand → 4 passed, 1 suite passed
**Review:** checklist result; requirements covered for foundation and vehicle API paths; no blocker findings after fix; no major issues deferred.
**Related errors:** E-001
**Next:** Phase 3 UI and browser-facing flow, followed by feature gate review and branch-ready documentation.

## IMP-002 | F01 | Docker setup | 2026-10-11
**Summary:** Added a Dockerfile and Compose services for the PostgreSQL-backed API, persistent vehicle uploads, and an isolated test database. Added run/test/seed instructions in `Docs/RUNNING.md`.
**Files added/changed:** Dockerfile, .dockerignore, docker-compose.yml, prisma/schema.prisma, server/src/modules/vehicles/service.js, package.json, .env, .env.example, Docs/RUNNING.md
**Decisions:** Use PostgreSQL in development and Docker to support Prisma enums and photo URL arrays; expose the development database on host port 5433 to avoid the common local PostgreSQL port.
**Tests:** `docker compose config` → passed; `npx prisma validate` → blocked by stale local SQLite URL, then corrected; Docker build/start → blocked because Docker Desktop engine is not running.
**Review:** Service health dependency and test database isolation configured; review of Docker runtime remains pending until the engine is available.
**Related errors:** E-002, E-003
**Next:** Start Docker Desktop, run the documented Compose startup and test commands, then continue the UI phase.

## IMP-003 | F01 | Docker verification | 2026-10-11
**Summary:** Resolved the Docker runtime and Prisma image compatibility issues. The Compose API and PostgreSQL services now start, the health endpoint responds, and the isolated PostgreSQL test profile passes.
**Files added/changed:** Dockerfile, logs/ERROR_LOG.md
**Decisions:** Use the Debian slim Node image with OpenSSL so Prisma's schema engine works consistently in both API and test containers.
**Tests:** `docker compose up --build -d` → services started; `Invoke-RestMethod http://localhost:4000/api/health` → `{"success":true,"data":{"status":"ok"}}`; `docker compose --profile test run --build --rm test` → 4 passed, 1 suite passed; `docker ps` → API and both PostgreSQL services running.
**Review:** Compose startup, health endpoint, and test-profile isolation verified; no outstanding Docker setup findings.
**Related errors:** E-003, E-004
**Next:** Phase 3 UI and browser-facing flow.

## IMP-004 | F01 | Phase 3 | 2026-10-11
**Summary:** Delivered the role-based DriveHire website with USER, DRIVER, and ADMIN sign-in, a responsive vehicle-management interface, authenticated API access, and Docker Compose integration. Hardened persistent test-database fixture cleanup and closed the seed, edit-flow, and test-runner errors.
**Files added/changed:** client/*, server/src/modules/auth/*, server/src/middleware/auth.js, server/src/modules/vehicles/*, server/src/prisma/seed.js, Dockerfile, docker-compose.yml, package.json, Docs/RUNNING.md, Docs/README.md, logs/ERROR_LOG.md
**Decisions:** Use real password verification and expiring JWT sessions; expose the admin fleet overview while keeping regular vehicle lists owner-scoped; make integration cleanup independent of the fixture owner UUID.
**Tests:** `docker compose --profile test run --build --rm test` → 7 server tests and 1 client test passed; `npm run build --prefix client` → passed; `npm test --prefix client` → 1 passed. Browser-tested owner vehicle creation, edit, availability changes, and admin fleet login/listing.
**Review:** Role-specific login and vehicle flows verified; Compose test profile passes. F01 Phase 4 and the Feature Gate remain incomplete.
**Related errors:** E-005, E-006, E-007, E-008
**Next:** Complete the remaining F01 Phase 4 requirements and Feature Gate review before release.

## IMP-005 | F01 | Phase 4 | 2026-10-11
**Summary:** Completed F01 hardening coverage for strict mass assignment, cross-owner IDOR masking, invalid media uploads, commitment-blocked deletion and soft-delete visibility. Added the PostgreSQL baseline migration with database-level seat-capacity and model-year validation, corrected the development runbook, and made feature documentation trackable by Git.
**Files added/changed:** prisma/migrations/20261011175000_f01_vehicle_baseline/migration.sql, prisma/migrations/migration_lock.toml, server/src/modules/vehicles/__tests__/vehicle.integration.test.js, .gitignore, Docs/README.md, Docs/RUNNING.md, logs/ERROR_LOG.md, logs/IMPLEMENTATION_LOG.md
**Decisions:** Use a trigger for the model-year constraint because PostgreSQL CHECK constraints cannot depend on the current date; retain the existing docker-compose db-push startup strategy while separately validating the migration workflow on a clean database.
**Tests:** `docker compose --profile test run --build --rm test` → 11 server tests and 1 client test passed; `npm run build:client` → passed; JavaScript syntax checks and `npx prisma validate` → passed; seed → passed; `prisma migrate reset --force` followed by `prisma migrate deploy` on a fresh isolated PostgreSQL database → passed.
**Review:** F01 checklist reviewed for role authorization, ownership masking, mass assignment, normalized duplicate registration, upload rejection, commitment checks and soft-delete exclusion; no outstanding local blocker. Remote PR merge to `dev` is not available because this repository has no `dev` branch.
**Related errors:** E-009
**Next:** F02 Phase 1 on a new feature branch.

## IMP-006 | F02 | Phases 1-4 | 2026-10-11
**Summary:** Added private vehicle and driver document intake, owner/admin-authorized document access, replacement history, expiry reminders, persistent in-app/email notifications, and responsive document and notification interfaces. Fixed the live portal's omitted vehicle-filter query and added regression coverage for authorization, path traversal, owner-specific reminders, and IST calendar-day thresholds.
**Files added/changed:** .env.example, Docs/RUNNING.md, docker-compose.yml, package.json, package-lock.json, prisma/schema.prisma, prisma/migrations/20261011200000_f02_documentation_notifications/migration.sql, server/src/app.js, server/src/server.js, server/src/lib/notifications.js, server/src/middleware/documentUpload.js, server/src/modules/documents/*, server/src/modules/notifications/*, server/src/jobs/*, client/src/App.jsx, client/src/App.test.jsx, client/src/api/http.js, client/src/features/documents/*, client/src/features/notifications/*, client/src/features/vehicles/*, client/src/styles.css, client/dist/*, logs/ERROR_LOG.md, Docs/README.md
**Decisions:** Store uploads outside static paths with random names and signature-based type checks; persist notifications before best-effort email delivery; compute expiry thresholds on the Asia/Kolkata calendar; keep the daily cron disabled in tests.
**Tests:** `docker compose --profile test run --build --rm test` → 4 server suites, 24 tests, and 2 client tests passed; `npm run build:client`, `npx prisma validate`, `git diff --check`, and fresh-database `prisma migrate reset` + `migrate deploy` → passed. Browser-tested owner sign-in, upload, private download, and deletion; MailHog captured the SMTP smoke-test email.
**Review:** F02 requirements and review checklist passed: owner/admin download access, cross-owner 404, private static path, path traversal rejection, MIME sniffing, supersession, SMTP failure persistence, owner-specific reminders, repeated-scan idempotence, and expiry events verified. No outstanding local implementation blockers; no lint script is configured. Feature Gate remains unchecked because the GitHub remote has no `dev` branch and no PR merge has occurred.
**Related errors:** E-010, E-011, E-012, E-013
**Next:** Complete the F02 PR/merge gate before starting F03.

## IMP-007 | F03 | Phase 1 | 2026-10-11
**Summary:** Added the driver profile and verification audit data layer, vehicle-status recomputation, expiry/upload event handling, and shared vehicle/driver verification guards for downstream features.
**Files added/changed:** prisma/schema.prisma, prisma/migrations/20261011233000_f03_verification_audit/migration.sql, server/src/modules/verification/status.js, server/src/modules/verification/guards.js, server/src/modules/verification/expiryListener.js, server/src/modules/verification/__tests__/verification.integration.test.js
**Decisions:** `DriverProfile` is the minimal provisioned record needed for background-check decisions; automated expiry uses `SYSTEM` as the non-admin audit actor because the audit schema has no nullable actor.
**Tests:** `docker compose --profile test run --build --rm test` → 5 server suites, 31 tests, and 2 client tests passed; `npx prisma validate` and Prisma client generation → passed.
**Review:** Status recomputation requires current non-superseded approved documents and commercial insurance; downstream guards require verified vehicles and approved drivers with an unexpired approved license. Document upload/expiry listeners recalculate status; no outstanding phase-one findings.
**Related errors:** none
**Next:** F03 Phase 2 owner submission and admin vehicle/document review API.

## IMP-008 | F03 | Phase 2 | 2026-10-11
**Summary:** Added owner vehicle-submission and administrator verification queue/detail/document decision APIs, including audit records, user notifications, ownership masking, review-path privacy, rejection reasons, commercial insurance checks, and race-safe single decisions.
**Files added/changed:** server/src/app.js, server/src/modules/documents/controller.js, server/src/modules/documents/service.js, server/src/modules/verification/controller.js, server/src/modules/verification/routes.js, server/src/modules/verification/schema.js, server/src/modules/verification/service.js, server/src/modules/verification/__tests__/verification.integration.test.js, logs/ERROR_LOG.md
**Decisions:** Review endpoints reveal owner contact only to administrators and never return internal document storage paths; review decisions conditionally update only PENDING documents inside a transaction.
**Tests:** `docker compose --profile test run --build --rm test` → 5 server suites, 36 tests, and 2 client tests passed, including concurrent decisions, ownership masking, commercial/private insurance rules, submission requirements, audit writes, and notifications.
**Review:** Non-admin requests are denied, unknown/non-owned vehicles are masked, decision races allow only one winner, and document storage paths remain private. E-014 resolved.
**Related errors:** E-014
**Next:** F03 Phase 3 driver approval API.

## IMP-009 | F03 | Phase 3 | 2026-10-11
**Summary:** Completed administrator driver-review APIs, driver queue with current license metadata, required-license approval checks, reasoned rejection, race-safe profile decisions, audit entries, notifications, and `assertDriverApproved` enforcement.
**Files added/changed:** server/src/modules/verification/service.js, server/src/modules/verification/controller.js, server/src/modules/verification/routes.js, server/src/modules/verification/schema.js, server/src/modules/verification/__tests__/verification.integration.test.js, server/src/prisma/seed.js
**Decisions:** A driver can be approved only with an approved, unexpired, non-superseded driver-level LICENSE; driver approvals use the existing GENERAL notification type.
**Tests:** `docker compose --profile test run --build --rm test` → 5 server suites, 38 tests, and 2 client tests passed.
**Review:** Admin-only access, missing-license rejection, status guard enforcement, single-decision race behavior, required rejection reason, owner notification, and audit persistence verified.
**Related errors:** none
**Next:** F03 Phase 4 admin portal and owner verification timeline.

## IMP-010 | F03 | Phases 4-5 | 2026-10-12
**Summary:** Added the administrator vehicle and driver review portal, authenticated document downloads, rejection-reason dialog, review audit history, and owner verification timeline with submission action.
**Files added/changed:** client/src/App.jsx, client/src/App.test.jsx, client/src/features/verification/, client/src/features/vehicles/VehicleDashboard.jsx, client/src/features/vehicles/api.js, client/src/styles.css, server/src/jobs/documentExpiry.js, server/src/lib/events.js, server/src/modules/documents/service.js, server/src/modules/vehicles/service.js, server/src/modules/verification/, logs/ERROR_LOG.md, client/dist/
**Decisions:** Verification submissions are allowed only from UNVERIFIED, REJECTED, or EXPIRED states; the conditional update prevents concurrent resubmissions and preserves VERIFIED status. Admin review responses expose only owner name and contact details.
**Tests:** `docker compose --profile test run --build --rm test` → 5 server suites, 42 tests, and 4 client tests passed; `npm run build:client`, `npx prisma validate`, fresh-database `prisma migrate reset` and `prisma migrate deploy`, and `git diff --check` passed. No lint script is configured.
**Review:** R1-R10 and F03 section 8 reviewed. Admin routes remain role-protected; verified state requires both current approved required documents including commercial insurance; expiry recomputation and audit, minimal owner data, race-safe document decisions, and loading/empty/error UI states verified. E-017 and E-018 resolved; no outstanding BLOCKER/MAJOR findings.
**Related errors:** E-015, E-016, E-017, E-018
**Next:** F03 feature gate review; remote `dev` branch/PR merge requirement remains unresolved.

## IMP-011 | F05 | Phase 1 | 2026-10-12
**Summary:** Added the F05 data layer including Booking, RideBooking, and RideLocation models, enums for BookingType and BookingStatus, and PostgreSQL migration with CHECK and partial unique index constraints.
**Files added/changed:** prisma/schema.prisma, prisma/migrations/20261012020000_f05_ride_booking/migration.sql, server/src/modules/bookings/__tests__/bookingData.integration.test.js, Docs/README.md
**Decisions:** Use PostgreSQL partial unique index on (rideId, passengerId) WHERE active to enforce at the database level that passengers cannot hold duplicate active booking requests for the same ride; enforce 1 to 6 seat booking boundary via table-level CHECK constraint.
**Tests:** `docker compose --profile test run --build --rm test` → 8 server suites, 58 tests, and 2 client suites, 9 tests passed.
**Review:** R1-R10 reviewed; duplicate active bookings rejected by partial unique index; inactive bookings permit subsequent booking creation; seats boundary CHECK enforced; no blocker or major findings.
**Related errors:** none
**Next:** F05 Phase 2 — Request, accept, reject, cancel API and services.

## IMP-012 | F05 | Phase 2 | 2026-10-12
**Summary:** Implemented the seat request, driver accept with atomic seat decrement, driver reject, passenger cancellation with atomic seat restoration and 60-minute cutoff, and automatic cancellation upon ride.cancelled.
**Files added/changed:** server/src/modules/bookings/schema.js, server/src/modules/bookings/service.js, server/src/modules/bookings/controller.js, server/src/modules/bookings/routes.js, server/src/modules/bookings/events.js, server/src/app.js, server/src/modules/bookings/__tests__/bookings.integration.test.js, Docs/README.md
**Decisions:** Accept uses a parameterized atomic raw SQL UPDATE with RETURNING * inside a single transaction to prevent seat overbooking under concurrency; cancellations within 60 minutes of departure are rejected with CANCELLATION_CUTOFF_EXCEEDED; cancelling an ACCEPTED booking on a FULL ride atomically reverts the ride to OPEN and increments availableSeats.
**Tests:** `docker compose --profile test run --build --rm test` → 9 server suites, 66 tests, and 2 client suites, 9 tests passed. Concurrency test with 10 parallel accepts on a 2-seat ride yielded exactly 2 successes and 8 conflicts with availableSeats = 0.
**Review:** R1-R10 and F05 section 8 reviewed; seat overbooking prevented under race conditions; status transitions strictly validated; ownership masked with 404; cancellation cutoff enforced server-side; no blocker or major findings.
**Related errors:** none
**Next:** F05 Phase 3 — Ride lifecycle (start, complete) & booking list buckets.

## IMP-013 | F05 | Phase 3 | 2026-10-12
**Summary:** Implemented ride lifecycle operations (start ride and complete ride), bucketed user booking history (upcoming, active, past), driver ride booking queries, incoming driver request queue, and the booking.completed event.
**Files added/changed:** server/src/modules/bookings/schema.js, server/src/modules/bookings/service.js, server/src/modules/bookings/controller.js, server/src/modules/bookings/routes.js, server/src/modules/bookings/__tests__/rideLifecycle.integration.test.js, Docs/README.md
**Decisions:** Moving rides to IN_PROGRESS atomically updates accepted bookings to ACTIVE; completing rides moves active bookings to COMPLETED, marks ride bookings inactive, and emits the booking.completed cross-feature event; user booking history classifies bookings into upcoming, active, and past buckets with departure time checks for expired pending/accepted requests.
**Tests:** `docker compose --profile test run --build --rm test` → 10 server suites, 69 tests, and 2 client suites, 9 tests passed. Verified bucket classification across all status and departure variations, ride lifecycle transitions, and driver-scoped request queries.
**Review:** R1-R10 and F05 section 8 reviewed; driver-only routes protected; caller cannot access other users' bookings; booking.completed emitted per completed booking; no blocker or major findings.
**Related errors:** none
## IMP-014 | F05 | Phase 4 | 2026-10-12
**Summary:** Implemented live ride tracking endpoints (POST and GET /api/rides/:id/location), socket room join authorization restricting ride:<id> exclusively to the driver and accepted/active passengers, and live ride:location event broadcasting.
**Files added/changed:** server/src/lib/realtime.js, server/src/modules/bookings/schema.js, server/src/modules/bookings/service.js, server/src/modules/bookings/controller.js, server/src/modules/bookings/routes.js, server/src/modules/bookings/__tests__/tracking.integration.test.js, server/src/lib/__tests__/realtime.integration.test.js, Docs/README.md
**Decisions:** Restrict `join:ride` room subscription so only authenticated drivers or passengers with an ACCEPTED or ACTIVE booking can enter the room and receive live location broadcasts; reject non-passengers with `{ success: false, error: 'Unauthorized.' }`; non-driver/non-accepted callers querying GET /api/rides/:id/location receive 404 to prevent coordinate leaks or ride existence probing; coordinates are validated for valid lat (-90 to 90) and lng (-180 to 180) ranges.
**Tests:** `docker compose --profile test run --build --rm test` → 11 server suites, 77 tests, and 2 client suites, 9 tests passed. Verified that driver updates location, socket room receives `ride:location`, unauthorized sockets are rejected from joining, and unauthorized HTTP requests receive 404.
**Review:** R1-R10 and F05 section 8 reviewed; privacy preserved (location accessible only to ride's driver and accepted passengers); no coordinate leakage; no blocker or major findings.
**Related errors:** none
## IMP-015 | F05 | Phase 5 | 2026-10-12
**Summary:** Implemented the full frontend user interface for carpool ride bookings, passenger booking list, real-time vehicle GPS tracking, and driver ride operations (request queue and lifecycle controls). Added client Vitest test suites and verified end-to-end production build.
**Files added/changed:** client/src/features/bookings/api.js, client/src/features/bookings/components/BookingModal.jsx, client/src/features/bookings/pages/MyBookingsPage.jsx, client/src/features/bookings/pages/TrackRidePage.jsx, client/src/features/bookings/pages/RideRequestsPage.jsx, client/src/features/bookings/pages/DriverRideManagePage.jsx, client/src/features/rides/pages/RideDetailPage.jsx, client/src/features/rides/pages/MyRidesPage.jsx, client/src/features/rides/components/RideShell.jsx, client/src/App.jsx, client/src/styles.css, client/src/features/bookings/Bookings.test.jsx, Docs/README.md
**Decisions:** Built all interfaces matching the approved editorial serif and geometric sans design system with flat contrast palette; wired `watchPosition` on DriverRideManagePage with 5-second throttling to prevent API congestion; disabled receipt action button with tooltip pointing to F06; integrated live Leaflet mapping on TrackRidePage with real-time Socket.IO vehicle marker updates.
**Tests:** `docker compose --profile test run --build --rm test` → 11 server suites, 77 tests, and 3 client suites, 14 tests passed (100% green). `npm run build:client` completed with 0 errors.
**Review:** Conducted full Section 8 feature-specific review and R1-R10 checklist: atomic seat locking verified, cancellation cutoff enforced, cross-passenger data isolation guaranteed, and privacy protected across HTTP and WebSocket channels.
**Related errors:** none
**Next:** Ready for final commit and feature gate validation.

## IMP-016 | F06 | Phase 1 | 2026-10-14
**Summary:** Implemented data layer models and migration for payments, promo codes, earnings, and pricing config singleton. Created admin commission configuration endpoints with 0-50% validation and singleton CHECK constraints.
**Files added/changed:** prisma/schema.prisma, prisma/migrations/20261014020000_f06_payments/migration.sql, server/src/prisma/seed.js, server/src/modules/payments/schema.js, server/src/modules/payments/service.js, server/src/modules/payments/controller.js, server/src/modules/payments/routes.js, server/src/app.js, server/src/modules/payments/__tests__/pricingConfig.integration.test.js, Docs/README.md
**Decisions:** Enforced singleton pattern on `pricing_config` via PostgreSQL `CHECK (id = 1)` and code-level upsert fallback; implemented raw-SQL balance constraints (`payeeAmount + commissionAmount = amount` and `commissionAmount + netAmount = grossAmount`) and non-negative amount checks; initialized `receipt_number_seq` for digital receipts; secured admin commission endpoints (`GET/PUT /api/admin/pricing/commission`) with `requireAuth` and `requireRole('ADMIN')`.
**Tests:** `npx jest server/src/modules/payments/__tests__/pricingConfig.integration.test.js --runInBand` → 1 suite, 19 tests passed (100% green). Verified 401 unauthenticated, 403 non-admin roles, 400 validation boundaries (negative, >50%, >2 decimal places, extraneous fields), successful update with `updatedById` tracking, and database-level rejection of invalid singleton/balance/negative-amount rows.
**Review:** Reviewed diff against HEAD commit `cc07fcaa96941374eccc0c1223585c2364317a15` following R1-R10 and F06 checklist: no IDOR, strict Zod validation without mass assignment, Decimal precision preserved, no secrets logged or exposed.
**Related errors:** none
**Next:** Phase 2 (Gateway abstraction & payment creation).



