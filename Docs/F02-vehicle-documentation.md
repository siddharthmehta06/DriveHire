# F02 — Vehicle Documentation, Expiry Alerts & Notifications

- **SRS:** Section 4.3, REQ-4.3.1–4.3.3, plus REQ-4.2.4 (expiry alerts) · **Priority:** Medium (but F03 depends on it)
- **Depends on:** F01 · **Class diagram:** `VehicleDocument` (upload, updateStatus, checkExpiry), `NotificationService.sendNotification`
- **Follow:** AGENTS.md.

## 1. Goal
A secure digital portal to upload and track licenses, permits, RC books and insurance, with validity tracking and automatic reminders. Also builds the shared notification service used by later features.

## 2. Scope
**In:** document upload/list/download, validity tracking, daily expiry scan, reminders, notification service (in-app + email), notification bell UI.
**Out:** approving/rejecting documents and vehicle status logic (F03).

## 3. Data model
```prisma
enum DocumentType   { RC INSURANCE LICENSE PERMIT }
enum DocumentStatus { PENDING APPROVED REJECTED EXPIRED }
enum InsuranceType  { COMMERCIAL PRIVATE }

model VehicleDocument {
  id              String   @id @default(uuid())
  ownerId         String
  vehicleId       String?              // null for LICENSE (belongs to the driver)
  type            DocumentType
  insuranceType   InsuranceType?       // required when type = INSURANCE
  documentNumber  String
  issueDate       DateTime?
  expiryDate      DateTime
  fileUrl         String               // internal path, never exposed directly
  originalName    String
  mimeType        String
  sizeBytes       Int
  status          DocumentStatus @default(PENDING)
  reviewedById    String?
  reviewedAt      DateTime?
  rejectionReason String?
  supersededAt    DateTime?            // set when a newer doc of same owner+vehicle+type is uploaded
  lastReminderDays Int?                // 30, 7 or 1: last threshold already notified
  createdAt       DateTime @default(now())
  @@index([vehicleId, type]) @@index([status, expiryDate])
  @@map("vehicle_documents")
}

enum NotificationType { DOC_EXPIRY_REMINDER DOC_APPROVED DOC_REJECTED VEHICLE_VERIFIED VEHICLE_REJECTED
  BOOKING_REQUESTED BOOKING_ACCEPTED BOOKING_REJECTED BOOKING_CANCELLED PAYMENT_RECEIPT CASHOUT_PROCESSED GENERAL }
model Notification {
  id String @id @default(uuid())
  userId String
  type NotificationType
  title String
  body String
  data Json?
  readAt DateTime?
  emailSentAt DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
  @@map("notifications")
}
```

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `POST /api/documents` | owner | multipart `file` (pdf/jpg/png ≤10 MB) + metadata. Vehicle docs need a vehicle the caller owns. Older doc of the same owner+vehicle+type gets `supersededAt` |
| `GET /api/documents` | owner, ADMIN | filters `vehicleId`, `type`, `status`; excludes superseded unless `includeHistory=true` |
| `GET /api/documents/:id` | owner, ADMIN | metadata |
| `GET /api/documents/:id/file` | owner, ADMIN | streams the file after authorization. Files are NOT served statically |
| `DELETE /api/documents/:id` | owner | only if PENDING or REJECTED |
| `GET /api/notifications` | self | paginated, `unreadOnly` filter |
| `PATCH /api/notifications/:id/read` · `POST /api/notifications/read-all` | self | |

Exports: `notify(userId, type, title, body, data?)` (inserts a row, then attempts email; email failure is logged and never throws), `runExpiryScan(now = new Date())`.

## 5. UI
`DocumentPortalPage` (per vehicle: RC and Insurance slots; driver-level License and Permit slots) · `UploadDocumentForm` (type, number, insurance type, issue/expiry dates, file) · status chips and "expires in N days" · `NotificationBell` in the header with unread count and dropdown.

## 6. Business rules & edge cases
- Expiry date must be in the future at upload. Issue date ≤ expiry date.
- Insurance uploads must state `COMMERCIAL` or `PRIVATE`; only COMMERCIAL can be approved later (F03).
- Expiry scan runs daily 02:00 IST via node-cron and is exposed as `runExpiryScan(now)` so it is testable. For APPROVED, non-superseded documents it notifies at 30, 7 and 1 days before expiry (use `lastReminderDays` to avoid duplicates), and marks documents past expiry as EXPIRED then emits `document.expired`.
- Emit `document.uploaded` after a successful upload.
- Uploaded filenames are random UUIDs; never trust the client's name or mime type alone (sniff the magic bytes).

## 7. Phases
### Phase 1 — Data layer & notification service
Tasks: models, migration, `lib/notifications.js` (`notify`, email via Nodemailer using SMTP env, MailHog/Ethereal in dev), notification endpoints.
Done when: `notify()` creates a row and sends email; email failure does not throw.

### Phase 2 — Documents API & storage
Tasks: Multer storage, magic-byte check, upload/list/get/file/delete endpoints, supersede logic, events.
Done when: a non-owner cannot fetch a file; replacing a document supersedes the previous one.

### Phase 3 — Expiry scan & reminders
Tasks: `runExpiryScan`, cron registration in `server.js` (disabled when `NODE_ENV=test`), threshold dedupe, EXPIRED transition and event.
Done when: tests with a fake clock show exactly one reminder per threshold and correct EXPIRED transitions.

### Phase 4 — UI, tests, feature review
Tasks: portal pages, notification bell, API tests (upload validation, IDOR on file download, supersede, scan thresholds), UI smoke test, full review plus section 8.

## 8. Feature-specific review checklist
- Can any user download another user's document via URL guessing?
- Is the upload path traversal-safe and the mime type verified by content?
- Is the expiry scan idempotent when run twice in one day?
- Does a failing SMTP server leave the API request successful?
- Do reminders reach the document's owner only?

## 9. Definition of Done
REQ-4.3.1–4.3.3 and REQ-4.2.4 demonstrably met · tests green · cron disabled in tests · both logs updated · status README ticked.
