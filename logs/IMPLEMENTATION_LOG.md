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

## IMP-011 | F04 | Phase 1 | 2026-10-12
**Summary:** Added the carpool ride data model and migration with status, seat-count and cost constraints plus search, driver, and vehicle indexes. Seed now provisions an approved sample driver, verified vehicle, and three future rides.
**Files added/changed:** prisma/schema.prisma, prisma/migrations/20261012003000_f04_carpool_rides/migration.sql, server/src/prisma/seed.js, Docs/README.md
**Decisions:** Database constraints enforce `totalSeats >= 1`, `availableSeats` within the total-seat range, and non-negative per-seat price; seeded rides use a driver account and vehicle that satisfy downstream posting guards.
**Tests:** `npx prisma validate` and `npx prisma generate` passed; on an isolated PostgreSQL database, fresh `prisma migrate reset` and `migrate deploy` passed, seed completed, and direct inserts with invalid seat counts and negative prices were rejected by database CHECK constraints. No lint script is configured.
**Review:** Migration, relations, required indexes, raw database constraints, deterministic ride seeds, and existing sample accounts reviewed; no phase-one findings.
**Related errors:** none
**Next:** F04 Phase 2 posting, detail, driver rides, cancellation APIs and vehicle commitment check.

## IMP-012 | F04 | Phase 2 | 2026-10-12
**Summary:** Added authenticated APIs to post rides, retrieve privacy-safe ride detail, list a driver's paginated rides, and cancel open/full rides. Posting calls F03 approval guards, checks ownership/availability/capacity and 30-minute lead time, enforces the vehicle's three-hour ride gap under a vehicle row lock, and registers the F01 vehicle commitment check.
**Files added/changed:** server/src/app.js, server/src/modules/rides/schema.js, server/src/modules/rides/service.js, server/src/modules/rides/controller.js, server/src/modules/rides/routes.js, server/src/modules/rides/__tests__/rides.integration.test.js, .env.example, Docs/RUNNING.md, Docs/README.md, logs/ERROR_LOG.md
**Decisions:** Client seat availability is not accepted; it is initialized to total seats. Ride details expose only the driver's first name and vehicle description. Ownership-scoped vehicle lookup occurs before the verification guard to prevent status probing.
**Tests:** `docker compose --profile test run --build --rm test` → 6 server suites, 49 tests, and 4 client tests passed; `npx prisma validate` and `git diff --check` passed. Focused tests cover approvals, vehicle state/ownership, seat and departure constraints, schedule conflict, API pagination, privacy, cancellation ownership/event, and commitments.
**Review:** R1-R10 and Phase 2 DoD reviewed; admin/passenger access to driver-only endpoints is denied, arbitrary fields are rejected, race-safe vehicle locking protects schedule gaps, cancellations conditionally transition once, and inaccessible vehicle IDs are masked. E-019 and E-020 resolved.
**Related errors:** E-019, E-020
**Next:** F04 Phase 3 search filters, authenticated Socket.IO rooms and live seat updates.

## IMP-013 | F04 | Phase 3 | 2026-10-12
**Summary:** Added bounded ride search with origin/destination, date/time, seats, fare, destination-radius and sort filters; parameterized and wildcard-escaped PostgreSQL search; JWT-authenticated Socket.IO with per-user rooms and authorized ride-room joins; and live seat/status publishing.
**Files added/changed:** package.json, package-lock.json, server/src/server.js, server/src/lib/realtime.js, server/src/lib/__tests__/realtime.integration.test.js, server/src/modules/rides/searchSchema.js, server/src/modules/rides/controller.js, server/src/modules/rides/routes.js, server/src/modules/rides/service.js, server/src/modules/rides/__tests__/rides.integration.test.js, logs/ERROR_LOG.md
**Decisions:** Use Prisma tagged SQL for every dynamic search value and static fragments for sorting; escape SQL wildcard characters as well as parameterizing user terms. Sockets join the authenticated user's room automatically and can join a ride room only after server-side existence/status validation.
**Tests:** Focused ride-search and realtime suites → 2 suites, 12 tests passed; full Docker suite → 7 server suites, 54 tests, and 2 client test files, 9 tests passed. `npx prisma validate`, `npm run build:client`, and `git diff --check` passed.
**Review:** Search inputs are strictly validated, paginated, indexed, parameterized and wildcard escaped; only OPEN rides with sufficient seats are returned and contact details are excluded. Invalid socket tokens are rejected, arbitrary user rooms are not joinable, and unauthorized/inactive ride rooms are denied. E-022 resolved.
**Related errors:** E-022
**Next:** F04 Phase 4 ride pages, maps, UI smoke tests, and final feature review.
