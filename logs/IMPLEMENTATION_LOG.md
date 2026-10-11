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
