# F03 — Vehicle Verification & Admin Audit

- **SRS:** Section 4.2 REQ-4.2.1–4.2.3 (REQ-4.2.4 built in F02), 5.2, 5.5 · **Priority:** High
- **Depends on:** F01, F02 · **Class diagram:** `VerificationController` (submitVehicleRegistration, reviewDocuments, approveDocument, rejectDocument, checkExpiryAlerts), `Vehicle.setVerificationStatus`, `Admin`
- **Follow:** AGENTS.md.

## 1. Goal
Only vehicles with valid registration and commercial insurance, and only drivers who passed license and background verification, can be used on the platform. Admins review submissions in an audit portal.

## 2. Scope
**In:** submit-for-review, admin queue, approve/reject documents with reasons, vehicle status recomputation, driver approval, audit trail, guards used by later features, notifications.
**Out:** document upload (F02), anything about rides or rentals (they only call the guards).

## 3. Data model
```prisma
enum AuditTargetType { DOCUMENT VEHICLE DRIVER }
model VerificationAudit {
  id String @id @default(uuid())
  adminId String
  targetType AuditTargetType
  targetId String
  action String            // APPROVED | REJECTED | SUBMITTED | AUTO_EXPIRED
  reason String?
  createdAt DateTime @default(now())
  @@index([targetType, targetId])
  @@map("verification_audits")
}
```
Reuses `Vehicle.verificationStatus`, `VehicleDocument.status` and `DriverProfile.backgroundCheckStatus`.

## 4. Vehicle state machine
`UNVERIFIED → UNDER_REVIEW` (owner submits, needs a PENDING-or-better RC and INSURANCE) · `UNDER_REVIEW → VERIFIED` (all required docs approved) · `UNDER_REVIEW → REJECTED` (a required doc rejected) · `VERIFIED → EXPIRED` (a required doc expires) · `REJECTED/EXPIRED → UNDER_REVIEW` (owner re-uploads and resubmits).

Single source of truth: `recomputeVehicleStatus(vehicleId)`. A vehicle is VERIFIED iff it has a non-superseded, APPROVED, unexpired RC **and** a non-superseded, APPROVED, unexpired COMMERCIAL insurance. Call it after every approve, reject and `document.expired` event, and write the result through F01's `setVerificationStatus`.

## 5. API contract
| Method & path | Who | Notes |
|---|---|---|
| `POST /api/vehicles/:id/submit-verification` | owner | 422 `MISSING_REQUIRED_DOCUMENTS` if RC or insurance absent |
| `GET /api/admin/verifications` | ADMIN | queue of UNDER_REVIEW vehicles, oldest first; paginated |
| `GET /api/admin/verifications/:vehicleId` | ADMIN | vehicle, owner (name only plus contact), documents |
| `POST /api/admin/documents/:id/approve` | ADMIN | 422 `INSURANCE_NOT_COMMERCIAL` for private insurance; 422 if already expired |
| `POST /api/admin/documents/:id/reject` | ADMIN | `{ reason }` required (min 5 chars) |
| `GET /api/admin/drivers?backgroundCheckStatus=PENDING` | ADMIN | drivers with their LICENSE document |
| `POST /api/admin/drivers/:userId/approve` · `/reject` | ADMIN | approve requires an APPROVED, unexpired LICENSE document; reject needs a reason |

Exports (`modules/verification/guards.js`): `assertVehicleVerified(vehicleId)` → 422 `VEHICLE_NOT_VERIFIED`; `assertDriverApproved(userId)` → 422 `DRIVER_NOT_APPROVED`.

## 6. Business rules
- Only ADMIN may approve or reject (SRS 5.5). Owners cannot approve their own documents.
- Every decision writes a `VerificationAudit` row and calls `notify()` (DOC_APPROVED, DOC_REJECTED, VEHICLE_VERIFIED, VEHICLE_REJECTED).
- Listen to `document.expired` and recompute; write an `AUTO_EXPIRED` audit row.
- Unverified vehicles cannot be listed or used (REQ-4.2.3); enforcement lives in the guards that F04 and F07 call.

## 7. Phases
### Phase 1 — Audit model & status engine
Tasks: model and migration, `recomputeVehicleStatus`, guards, event listener for `document.expired`.
Done when: unit tests cover every transition in section 4.

### Phase 2 — Owner submit & admin review API
Tasks: submit endpoint, queue, detail, approve and reject for documents, audit writes, notifications.
Done when: approving both required docs flips the vehicle to VERIFIED; rejecting one flips it to REJECTED with the reason delivered.

### Phase 3 — Driver approval API
Tasks: driver queue and approve/reject; guard `assertDriverApproved`.
Done when: a driver without an approved license cannot be approved.

### Phase 4 — Admin portal UI & owner timeline
Tasks: `AuditQueuePage`, `AuditDetailPage` (fetch documents as authenticated blobs, approve/reject modal with reason), `DriverApprovalPage`; owner-side "Submit for verification" button and status timeline on `VehicleDetailPage`.

### Phase 5 — Tests & feature review
Tasks: tests for guards, forbidden access by non-admin, private-insurance rejection, expiry downgrade, audit rows; full review plus section 8.

## 8. Feature-specific review checklist
- Is there any way a non-admin reaches `/api/admin/*`?
- Can a vehicle become VERIFIED without both required documents approved and unexpired?
- Does expiry always downgrade VERIFIED vehicles?
- Is the admin's view of owner data limited to what review needs?
- Are decisions race-safe if two admins act on the same document?

## 9. Definition of Done
REQ-4.2.1–4.2.3 met with REQ-4.2.4 verified end to end · guards exported and tested · audit trail complete · logs and status README updated.
