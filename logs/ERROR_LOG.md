# Error Log

## E-001 | F01 | Phase 1 | Status: RESOLVED
**Detected by:** build
**Symptom:** Prisma rejected the SQLite schema during `npm test` because `String[]` and enum fields are unsupported by the current connector.
**Root cause:** The project was configured for SQLite local testing while the schema used Prisma array and enum features that require a different provider.
**Fix:** Simplified the schema to SQLite-compatible string fields and JSON-encoded photo URLs, then adjusted the service layer to normalize photo URL arrays when reading and writing.
**Files:** prisma/schema.prisma, server/src/modules/vehicles/service.js
**Prevention:** Keep schema features provider-compatible for the active database, and validate `prisma db push` before running the wider suite.
**Resolved in:** IMP-001

## E-002 | F01 | Docker setup | Status: RESOLVED
**Detected by:** build
**Symptom:** `npx prisma validate` reported that the configured datasource URL must use `postgresql://` after the Prisma provider was changed to PostgreSQL.
**Root cause:** The ignored local `.env` still contained the previous SQLite URL.
**Fix:** Updated the local `.env` database URL to the Compose-mapped PostgreSQL endpoint and updated `.env.example` to match.
**Files:** .env, .env.example
**Prevention:** Keep local environment settings synchronized with the Prisma provider and the documented Compose ports.
**Resolved in:** IMP-002

## E-003 | F01 | Docker setup | Status: RESOLVED
**Detected by:** runtime
**Symptom:** `docker compose up --build -d` could not connect to `dockerDesktopLinuxEngine` because the Docker daemon pipe was unavailable.
**Root cause:** Docker Desktop's Linux engine is not running in this environment.
**Fix:** Started Docker Desktop's Linux engine; `docker ps` then returned successfully.
**Files:** none
**Prevention:** Start Docker Desktop and confirm its Linux engine is running before building or starting Compose services.
**Resolved in:** IMP-003

## E-005 | F01 | Phase 3 | Status: RESOLVED
**Detected by:** runtime
**Symptom:** Seeding the newly added role accounts stopped with `ReferenceError: users is not defined` at `server/src/prisma/seed.js:68`.
**Root cause:** The vehicle seed still referenced the old local variable after it was renamed to `owner`.
**Fix:** Corrected the vehicle seed to reference the renamed `owner` variable.
**Files:** server/src/prisma/seed.js
**Prevention:** Run the seed end-to-end after modifying seeded account relationships.
**Resolved in:** IMP-004

## E-006 | F01 | Phase 3 | Status: RESOLVED
**Detected by:** runtime
**Symptom:** Browser edit flow returned HTTP 400 when saving vehicle details after testing vehicle creation.
**Root cause:** The edit form submitted its disabled registration-number field, which the strict update schema correctly rejects as non-editable.
**Fix:** Omit the registration number when building an update payload for an existing vehicle.
**Files:** client/src/features/vehicles/api.js, client/src/features/vehicles/VehicleForm.jsx, server/src/modules/vehicles/controller.js, server/src/modules/vehicles/service.js
**Prevention:** Exercise vehicle updates through the browser against the real API, not only the frontend build.
**Resolved in:** IMP-004

## E-007 | F01 | Phase 3 | Status: RESOLVED
**Detected by:** test
**Symptom:** The Docker aggregate `npm test` ran Jest against `client/src/App.test.jsx`, which failed because Jest does not transform the client's JSX/Vitest test setup.
**Root cause:** The server Jest command searched the whole repository and discovered the frontend test despite its separate Vitest runner.
**Fix:** Restrict the server Jest invocation to `server/src`; the aggregate test command then runs Vitest separately through `npm run test:client`.
**Files:** package.json
**Prevention:** Keep test runners scoped to their configured source trees.
**Resolved in:** IMP-004

## E-008 | F01 | Phase 3 | Status: RESOLVED
**Detected by:** test
**Symptom:** Re-running the integration suite against the persistent Docker test database failed vehicle creation with `REGISTRATION_EXISTS`.
**Root cause:** A prior suite version used a different owner UUID and left its vehicle rows in the shared test database; cleanup targeted only the current test owner's ID.
**Fix:** Clean up all fixed test registration numbers before and after each test in the isolated test database.
**Files:** server/src/modules/vehicles/__tests__/vehicle.integration.test.js
**Prevention:** Make fixture cleanup independent of the specific owner identifier when using a persistent test database.
**Resolved in:** IMP-004

## E-004 | F01 | Docker setup | Status: RESOLVED
**Detected by:** runtime
**Symptom:** The API exited during startup, and the test profile failed with `Could not parse schema engine response` after Prisma could not detect OpenSSL in `node:20-alpine`.
**Root cause:** Prisma 5's query/schema engines require an OpenSSL library that is not available in the selected Alpine image.
**Fix:** Switched to `node:20-bookworm-slim` and installed OpenSSL and CA certificates in the image.
**Files:** Dockerfile
**Prevention:** Use a Prisma-supported base image with OpenSSL installed and confirm both schema push and API startup inside the built image.
**Resolved in:** IMP-003

## E-009 | F01 | Phase 4 | Status: RESOLVED
**Detected by:** test
**Symptom:** `prisma migrate deploy` on the fresh migration-check database reported `No migration found in prisma/migrations`.
**Root cause:** The one-off test container used a previously built image that predated the new migration files.
**Fix:** Rebuilt the test image after adding the migration and reran reset/deploy against a dedicated empty PostgreSQL database.
**Files:** prisma/migrations/20261011175000_f01_vehicle_baseline/migration.sql
**Prevention:** Rebuild the test image after changing Prisma migration files before validating migration deployment.
**Resolved in:** IMP-005

## E-010 | F02 | Phase 2 | Status: RESOLVED
**Detected by:** test
**Symptom:** The authorized document download test failed because `supertest` returned the PDF payload as a Buffer and `response.text` was undefined.
**Root cause:** The assertion treated a binary attachment as a text response.
**Fix:** Read binary downloads from `response.body` and assert the returned Buffer instead of the text parser.
**Files:** server/src/modules/documents/__tests__/document.integration.test.js
**Prevention:** Assert binary download payloads through the response buffer rather than the text parser.
**Resolved in:** IMP-006

## E-011 | F02 | Phase 4 | Status: RESOLVED
**Detected by:** test
**Symptom:** The frontend authentication smoke test expected two requests after login but received an additional `/api/notifications` request from the new notification bell.
**Root cause:** The test asserted the pre-notification UI's request count.
**Fix:** Updated the authentication smoke test to account for the notification bell's additional authenticated request.
**Files:** client/src/App.test.jsx
**Prevention:** Update the app-level smoke test whenever a new authenticated global component adds API initialization.
**Resolved in:** IMP-006

## E-012 | F02 | Phase 4 | Status: RESOLVED
**Detected by:** test
**Symptom:** The document portal UI smoke test found the driver-only document option inside the all-types filter, despite checking its absence from the upload selector.
**Root cause:** The query searched every `<select>` instead of scoping to the upload type control.
**Fix:** Scoped the assertion to the upload document-type selector.
**Files:** client/src/App.test.jsx
**Prevention:** Scope accessibility queries to the specific control whose options are under test.
**Resolved in:** IMP-006

## E-013 | F02 | Phase 4 | Status: RESOLVED
**Detected by:** runtime
**Symptom:** The document portal's vehicle selector request returned `VALIDATION_ERROR` because its query included `isAvailable=undefined`.
**Root cause:** The vehicle API helper filtered only the empty string, so an omitted option was stringified and sent as a query value.
**Fix:** Omit `isAvailable` when it is either empty or undefined, and assert the exact unfiltered vehicle URL in the UI smoke test.
**Files:** client/src/features/vehicles/api.js, client/src/App.test.jsx
**Prevention:** Exercise authenticated feature flows against the running API in addition to mocked UI tests.
**Resolved in:** IMP-006

## E-014 | F03 | Phase 2 | Status: RESOLVED
**Detected by:** test
**Symptom:** The document-rejection API test received 422 `MISSING_REQUIRED_DOCUMENTS` before reaching the rejection assertions.
**Root cause:** The fixture submitted a vehicle with only an RC document and omitted the required insurance document.
**Fix:** Added the missing current commercial-insurance fixture to the rejection test before submitting the vehicle.
**Files:** server/src/modules/verification/__tests__/verification.integration.test.js
**Prevention:** Build API test fixtures with all prerequisites required by the endpoint under test.
**Resolved in:** IMP-008

## E-015 | F03 | Phase 4 | Status: RESOLVED
**Detected by:** test
**Symptom:** Clicking the owner verification submission button raised `ReferenceError: submitForVerification is not defined`.
**Root cause:** The new handler was accidentally scoped inside `confirmDelete` instead of the dashboard component.
**Fix:** Moved the handler into the dashboard component scope and re-ran the owner submission smoke test.
**Files:** client/src/features/vehicles/VehicleDashboard.jsx
**Prevention:** Exercise newly wired UI handlers through the feature smoke test before committing the phase.
**Resolved in:** IMP-010

## E-016 | F03 | Phase 4 | Status: RESOLVED
**Detected by:** test
**Symptom:** The verification UI smoke test failed with “Found multiple elements with the text: Toyota Innova”.
**Root cause:** The selected record name appears in both the queue and review detail.
**Fix:** Changed the smoke test to select the unique review-detail heading by role.
**Files:** client/src/App.test.jsx
**Prevention:** Use role- or region-scoped selectors when the same record summary is intentionally repeated.
**Resolved in:** IMP-010

## E-017 | F03 | Phase 5 | Status: RESOLVED
**Detected by:** review
**Symptom:** An owner could submit a vehicle that was already UNDER_REVIEW or VERIFIED, creating duplicate audit entries or downgrading a verified vehicle.
**Root cause:** The submission service validated documents but did not enforce the allowed source states in the vehicle state machine.
**Fix:** Restricted submissions to UNVERIFIED, REJECTED, or EXPIRED vehicles and guarded the conditional transaction update; added regression coverage for UNDER_REVIEW and VERIFIED states.
**Files:** server/src/modules/verification/service.js, server/src/modules/verification/__tests__/verification.integration.test.js
**Prevention:** Enforce state-machine source states in both request validation and the conditional database update.
**Resolved in:** IMP-010

## E-018 | F03 | Phase 5 | Status: RESOLVED
**Detected by:** test
**Symptom:** The complete test suite failed because a document-rejection test attempted to submit a vehicle already in UNDER_REVIEW.
**Root cause:** The legacy test used the helper's UNDER_REVIEW default for a first-time submission.
**Fix:** Initialized the test vehicle as UNVERIFIED before exercising its first submission.
**Files:** server/src/modules/verification/__tests__/verification.integration.test.js
**Prevention:** Initialize state-machine API test fixtures in a valid source state for the transition being tested.
**Resolved in:** IMP-010

## E-019 | F04 | Phase 2 | Status: RESOLVED
**Detected by:** test
**Symptom:** The focused ride integration suite failed with `The table public.carpool_rides does not exist in the current database`.
**Root cause:** The test runner was invoked directly without the test profile's required Prisma schema push.
**Fix:** Ran `npx prisma db push` against the test profile before rerunning the focused ride integration suite; all six ride tests passed.
**Files:** none
**Prevention:** Run Prisma schema setup before focused integration suites, matching the repository's test script.
**Resolved in:** IMP-012

## E-020 | F04 | Phase 2 | Status: RESOLVED
**Detected by:** review
**Symptom:** Ride posting checked vehicle verification before checking ownership, exposing whether an arbitrary vehicle ID was verified.
**Root cause:** The shared verification guard was called before resolving the vehicle in the caller's owner scope.
**Fix:** Resolve the vehicle using the caller's ownership scope before checking verification; add a regression test proving a foreign unverified vehicle returns the same 404 as any inaccessible vehicle.
**Files:** server/src/modules/rides/service.js, server/src/modules/rides/__tests__/rides.integration.test.js
**Prevention:** Resolve resources through an ownership-scoped query before returning resource-specific state.
**Resolved in:** IMP-012

## E-021 | F04 | Phase 3 | Status: RESOLVED
**Detected by:** dependency
**Symptom:** Installing the current React Leaflet release failed with `ERESOLVE` because it requires React 19 while this client uses React 18.
**Root cause:** The package manager selected React Leaflet 5, which is incompatible with the existing React major version.
**Fix:** Installed React Leaflet 4.2.1, which supports the project's React 18 version, along with its compatible Leaflet peer dependency.
**Files:** package.json, client/package.json
**Prevention:** Select library versions compatible with the repository's pinned framework major versions.
**Resolved in:** IMP-014

## E-022 | F04 | Phase 3 | Status: RESOLVED
**Detected by:** test
**Symptom:** The ride search test received HTTP 400 when its `timeFrom` and `timeTo` were the same minute.
**Root cause:** The test fixture defined an empty time interval while expecting it to be accepted by the strict search query validator.
**Fix:** Changed the fixture to a valid non-empty time range while retaining a separate assertion that rejects reversed intervals.
**Files:** server/src/modules/rides/__tests__/rides.integration.test.js
**Prevention:** Construct non-empty date/time ranges in search test fixtures and retain explicit empty-range validation.
**Resolved in:** IMP-013
