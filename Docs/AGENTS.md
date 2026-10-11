# AGENTS.md — DriveHire & CarPooling Platform

Read this file fully before every session. It defines HOW you work. The feature files in `docs/features/` define WHAT you build.

## 1. Project snapshot
- Web platform: carpooling, hourly/daily rental, peer-to-peer car sharing. Source of truth: the SRS (v1.0) and the class diagram.
- Stack: **React (Vite) · Node.js + Express · PostgreSQL · Prisma · Docker · GitHub**.
- Extras: Zod (validation), JWT (auth, already built), Multer (uploads), Socket.IO (real-time), node-cron (jobs), Nodemailer (email), pdfkit (receipts), Leaflet + OpenStreetMap (maps), Jest + Supertest (API tests), Vitest + React Testing Library (UI smoke tests), pino (logging).
- Currency INR. Timezone for reports: Asia/Kolkata. Store all timestamps in UTC.

## 2. Scope
Eight features, implemented in this order. **Login and registration are OUT OF SCOPE** (already built separately).

| ID | Feature | File |
|----|---------|------|
| F01 | Vehicle Management | docs/features/F01-vehicle-management.md |
| F02 | Vehicle Documentation & Notifications | docs/features/F02-vehicle-documentation.md |
| F03 | Vehicle Verification & Admin Audit | docs/features/F03-vehicle-verification.md |
| F04 | Post Ride & Search Ride | docs/features/F04-post-and-search-ride.md |
| F05 | Ride Booking, Booking List & Tracking | docs/features/F05-ride-booking.md |
| F06 | Payments, Receipts, Commission & Promo | docs/features/F06-payments.md |
| F07 | P2P Listing & Hourly/Daily Rental | docs/features/F07-p2p-listing-and-rental.md |
| F08 | Earnings & Cash-out | docs/features/F08-earnings-cashout.md |

Never start feature N+1 until feature N has passed its Feature Gate (section 8). Track progress in `docs/features/README.md`.

### Auth contract (assumed to exist)
- Server: `server/src/middleware/auth.js` exports `requireAuth` (sets `req.user = { id, role }`) and `requireRole(...roles)`. Roles: `USER`, `DRIVER`, `ADMIN`.
- Prisma: `User` (id uuid, name, email, phone, passwordHash, role) and `DriverProfile` (userId unique, licenseNumber, backgroundCheckStatus: PENDING | APPROVED | REJECTED).
- Client: `useAuth()` returns `{ user, token }`; `<ProtectedRoute roles={[...]}>`; axios instance at `client/src/api/http.js` attaching the token.
- If something above is missing, create the smallest stub that matches this contract, and record it in the implementation log so it can be swapped for the real one.
- Both USER and DRIVER can own vehicles. Only a DRIVER with `backgroundCheckStatus = APPROVED` can post rides.

## 3. Repository layout
```
drivehire/
├── AGENTS.md
├── docker-compose.yml            # postgres, postgres-test, api, client
├── docs/features/                # README.md (status) + F01..F08
├── logs/
│   ├── IMPLEMENTATION_LOG.md     # what was built (ONLY)
│   └── ERROR_LOG.md              # what went wrong (ONLY)
├── server/src/
│   ├── app.js  server.js
│   ├── lib/        # prisma, errors, response, validate, events, realtime, notifications, logger
│   ├── middleware/ # auth, upload, errorHandler
│   ├── modules/    # vehicles, documents, verification, rides, bookings, payments, rentals, earnings
│   │   └── <module>/{routes,controller,service,schema}.js + __tests__/
│   ├── jobs/       # cron jobs
│   └── prisma/     # schema.prisma, migrations/, seed.js
└── client/src/
    ├── api/  components/  context/
    └── features/<feature>/{pages,components,api.js}
```
Controllers carry the class-diagram names where one exists (RideController, RentalController, VerificationController).

## 4. Conventions
- **Response envelope:** success `{ success: true, data, meta? }`; failure `{ success: false, error: { code, message, details? } }`.
- **Errors:** throw `AppError(code, message, httpStatus, details?)`. Codes: `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `UNPROCESSABLE` 422 (business rule) · `INTERNAL` 500. Feature-specific codes (e.g. `VEHICLE_NOT_VERIFIED`) are 422 or 409.
- **Validation:** Zod schema for every body, query and params. Reject unknown fields. Never spread `req.body` into Prisma.
- **IDs:** UUID. **Money:** `Decimal(10,2)`, never floats; serialize as strings; round half-up to 2 dp.
- **SQL:** Prisma first; raw SQL only with `$queryRaw` tagged templates (parameterized). Constraints that Prisma cannot express go in a hand-edited migration (`prisma migrate dev --create-only`).
- **Pagination:** all list endpoints take `page` (default 1) and `limit` (default 20, max 100) and return `meta: { page, limit, total }`.
- **Ownership:** every resource route checks the caller owns the resource or is ADMIN. Return 404 (not 403) when the caller must not learn the resource exists.
- **Config:** secrets and tunables from env; keep `.env.example` current. No secrets in code or logs.
- **Naming:** files kebab/camel consistently within a module; DB columns snake_case via `@map`.

## 5. Cross-feature contracts (do not break; do not re-implement)
| Contract | Defined in | Used by |
|----------|-----------|---------|
| Event bus `lib/events.js` (`document.uploaded`, `document.expired`, `document.reviewed`, `vehicle.verification-changed`, `ride.cancelled`, `booking.completed`, `payment.succeeded`) | F01 | all |
| `registerCommitmentCheck(fn)` — blocks vehicle delete/unlist when it has future commitments | F01 | F04, F07 register |
| `notify(userId, type, title, body, data?)` | F02 | F03, F05, F06, F08 |
| `assertVehicleVerified(vehicleId)`, `assertDriverApproved(userId)` | F03 | F04, F07 |
| `lib/realtime.js` (`emitToRide`, `emitToUser`, socket auth, rooms) | F04 | F05 |
| Payment amount strategies `registerAmountStrategy(type, fn)` | F06 | F06 registers RIDE, F07 registers RENTAL |
| `earningsService.credit(payment)` | F06 | F08 reads ledger |
| `Booking` base table | F05 | F06, F07 |

If a contract you need is missing, do not build a private copy. Log it as an error (type BLOCKED-DEPENDENCY) and stop.

## 6. Phase protocol (the loop — follow exactly)
For each phase in a feature file:
1. **Prepare.** Read the feature file, the latest `IMPLEMENTATION_LOG.md` entries, and every OPEN entry in `ERROR_LOG.md` for this feature. Note the starting commit SHA (`git rev-parse HEAD`).
2. **Implement** only that phase's tasks. No scope creep, no work from later phases.
3. **Verify.** Run lint, the phase's tests, then the full test suite. Fix failures (see section 7 for logging).
4. **Review** (section 6.1). This is a separate step done after verification passes.
5. **Log.** Append one entry to `IMPLEMENTATION_LOG.md`. Tick the phase in `docs/features/README.md`.
6. **Commit.** `feat(F04): phase 2 - ride search API`. Then continue to the next phase.

If the session ends mid-phase, the next session resumes from step 1 using the logs, never from memory.

### 6.1 Review protocol
Review the diff as if someone else wrote it: `git diff <phase-start-sha>..HEAD`. Go file by file, then walk this checklist, then the feature-specific checklist (feature file section 8).

- **R1 Requirements:** every REQ in the phase is met; nothing out-of-scope was added.
- **R2 AuthZ:** each route has `requireAuth`, the correct role, and an ownership check (no IDOR).
- **R3 Validation:** Zod on body/query/params; no mass assignment; enums enforced.
- **R4 Integrity:** transactions where multiple writes belong together; races handled (seats, overlaps, balances); idempotency where retries are possible.
- **R5 Errors:** `AppError` used; nothing swallowed; no stack traces or PII in responses; envelope is consistent.
- **R6 Security:** no secrets; upload type/size limits; parameterized SQL only; PII not logged.
- **R7 Performance:** no N+1; pagination; indexes match filters.
- **R8 Quality:** small functions, no dead or commented-out code, no duplicated helpers, names match the class diagram.
- **R9 Tests:** new behaviour covered, including failure paths; suite and lint pass.
- **R10 UI (if touched):** loading, empty and error states; role-guarded routes; form validation; labelled inputs; no hard-coded API URLs.

Record each finding with severity **BLOCKER / MAJOR / MINOR**. Fix BLOCKER and MAJOR before committing. Fix MINOR or list it as deferred in the log. Every BLOCKER or MAJOR finding also gets an `ERROR_LOG.md` entry (Detected by: review). After fixes, re-run tests and re-review the changed lines.

## 7. Logging rules (two separate files, never mixed)
**`logs/IMPLEMENTATION_LOG.md`** records what was built. **`logs/ERROR_LOG.md`** records what went wrong. Both are append-only: never delete or rewrite old entries (an error entry may only have its Status/Fix fields completed). Use `date -I` for dates. IDs are sequential: `IMP-001…`, `E-001…`.

Rules:
- Log an error **at the moment it happens**, before attempting the fix. This includes failing tests, build/lint errors, migration failures, runtime exceptions, wrong behaviour found in review, and blocked dependencies.
- Never describe an error inside the implementation log. Reference its ID in "Related errors".
- Never describe finished work inside the error log.
- Max **3 fix attempts** per error. After that set Status `BLOCKED`, stop work, and ask the human.
- Before implementing, scan ERROR_LOG for earlier errors of the same kind and apply their "Prevention" notes.

Implementation entry format:
```
## IMP-### | F0X | Phase N | YYYY-MM-DD
**Summary:** one or two sentences
**Files added/changed:** list
**Decisions:** decision — reason
**Tests:** command → result (counts)
**Review:** checklist result; findings (severity) fixed; deferred MINORs
**Related errors:** E-### or none
**Next:** next phase or gate
```
Error entry format:
```
## E-### | F0X | Phase N | Status: OPEN | RESOLVED | BLOCKED
**Detected by:** test | build | runtime | review | dependency
**Symptom:** exact message or behaviour
**Root cause:**
**Fix:**
**Files:**
**Prevention:** how to avoid it next time
**Resolved in:** IMP-### (when resolved)
```

## 8. Feature Gate (before moving to the next feature)
- All phases ticked; every Definition-of-Done item in the feature file satisfied.
- Full suite green; lint clean; migrations apply from scratch (`prisma migrate reset` then `migrate deploy`).
- No OPEN or BLOCKED entries for this feature in ERROR_LOG.
- `.env.example`, seed data and README status updated.
- Branch `feature/F0X-slug` merged into `dev` via PR with a short summary.

## 9. Stop and ask the human when
A requirement is ambiguous or contradicts the SRS · an error is BLOCKED · you need to change a cross-feature contract · you want to add a dependency not listed in section 1 · a change would delete data or rewrite committed migrations.

## 10. Git
Branch per feature from `dev`. One commit per phase, plus `fix(F0X): E-### short note` commits for logged errors. Never commit `.env`, `server/uploads/`, or `node_modules`. Never rewrite pushed history.

Do Not Include these in the UI design
• 1. harsh gradients
• 2. lucide icons
• 3. pure white background
• 4. rainbow coloring
• 5. drop shadows
• 6. 3 feature cards in a row
• 7. emojis
• 8. liquid glass
• 9. em dashes
• 10. inter/geist/space grotesk
• 11. colored left stripe
• 12. fake testimonials
• 13. bento grids
• 14. terminal window
• 15. "it's not x, it's y"
• 16. checkmark bullets
• 17. 3 pricing tiers
• 18. no real product demos
• 19. soft corner radius
• 20. purple and black
• 21. no skeleton loaders
• 22. radial orbs
• 23. dot grids
• 24. sparkle icons
• 25. animated arrows
• 26. no TOS
• 27. no privacy policy
• 28. hover animations
• 29. neon colors
• 30. basic pastel colors

You are an award-winning elite digital designer and front-end engineer. We are building a website that must completely avoid the generic, overused "SaaS landing page" aesthetic.

only after completing a phase can you make the changes mentioned below
Strictly enforce the following design rules:
1. TYPOGRAPHY AS CARRIER: Do not use Inter, Geist, or Space Grotesk. Choose a high-contrast pairing: an expressive editorial serif or high-personality display font for headers, and a highly readable geometric sans or monospaced font for data/body. Layout relies on typographical scale, not structural boxes.
2. LAYOUT REVOLUTION: Ban bento grids and predictable 3-column feature blocks. Use asymmetrical layouts, broken grids, or single-column structural stacks with extensive, high-dignity whitespace.
3. FLAT OR CONTRAST-DRIVEN (NO SHADOW SLOP): Ban drop shadows, radial orbs, neon glowing borders, liquid glass effects, and harsh gradients. Elements must be distinguished through crisp borders, solid structural lines, or raw typographic spacing.
4. HONESTY over GIMMICKRY: Ban sparkle icons, animated arrows, fake testimonials, and conversational "It's not X, it's Y" copy. Use hyper-clear, technical, domain-specific text. Replace abstract illustrations with highly detailed, actual product wireframes or interactive data tables.
5. LEGAL RIGOUR: Generate real, complete placeholders for a standard Terms of Service (TOS) and Privacy Policy footer link structure immediately.

Before writing code, propose the layout blueprint, the exact type scale, and the color token system for approval.