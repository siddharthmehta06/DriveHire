# F06 — Payments, Receipts, Commission & Promo Codes

- **SRS:** Section 4.7, REQ-4.7.1–4.7.4; 5.3 · **Priority:** High
- **Depends on:** F05 · **Class diagram:** `Payment` (processPayment, generateReceipt), `PaymentGateway.processOnlinePayment`, `RideController.initiatePayment`, `Admin` (configurePricing, managePromoCode)
- **Follow:** AGENTS.md.

## 1. Goal
After a ride or rental is completed the payer chooses online or cash payment, can apply a promo code, and receives a digital receipt. Admin configures commission and promo codes. A minimal earnings ledger is created for payees (reporting and cash-out come in F08).

## 2. Scope
**In:** payment lifecycle, gateway abstraction (mock + Razorpay test mode), promo codes, commission config, receipts (JSON + PDF), earnings ledger credit, admin screens.
**Out:** refunds, earnings reports, cash-out (F08), rental pricing rules (F07, which only registers an amount strategy).

## 3. Data model
```prisma
enum PaymentMethod { ONLINE CASH }
enum PaymentStatus { PENDING PROCESSING SUCCEEDED FAILED CANCELLED }
enum DiscountType  { PERCENT FLAT }

model Payment {
  id String @id @default(uuid())
  bookingId String @unique
  payerId String
  payeeId String
  baseAmount Decimal @db.Decimal(10,2)
  discountAmount Decimal @db.Decimal(10,2) @default(0)
  amount Decimal @db.Decimal(10,2)              // final payable
  commissionRatePct Decimal @db.Decimal(5,2)    // snapshot at creation
  commissionAmount Decimal @db.Decimal(10,2)
  payeeAmount Decimal @db.Decimal(10,2)
  promoCodeId String?
  method PaymentMethod?
  status PaymentStatus @default(PENDING)
  gatewayProvider String?
  gatewayOrderId String? @unique
  gatewayPaymentId String?
  failureReason String?
  receiptNumber String? @unique
  paidAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("payments")
}
model PromoCode {
  id String @id @default(uuid())
  code String @unique                           // stored uppercase
  discountType DiscountType
  value Decimal @db.Decimal(10,2)
  maxDiscount Decimal? @db.Decimal(10,2)
  minAmount Decimal? @db.Decimal(10,2)
  usageLimit Int?
  usedCount Int @default(0)
  validFrom DateTime
  validUntil DateTime
  active Boolean @default(true)
  @@map("promo_codes")
}
model PricingConfig {                           // singleton row id = 1
  id Int @id @default(1)
  commissionRatePct Decimal @db.Decimal(5,2) @default(10)
  updatedById String?
  updatedAt DateTime @updatedAt
  @@map("pricing_config")
}
model EarningEntry {
  id String @id @default(uuid())
  earnerId String
  paymentId String @unique
  bookingType BookingType
  grossAmount Decimal @db.Decimal(10,2)
  commissionAmount Decimal @db.Decimal(10,2)
  netAmount Decimal @db.Decimal(10,2)
  withdrawable Boolean                          // true only for ONLINE payments
  createdAt DateTime @default(now())
  @@index([earnerId, createdAt])
  @@map("earning_entries")
}
model EarningsAccount {
  userId String @id
  withdrawableBalance Decimal @db.Decimal(12,2) @default(0)
  totalEarned Decimal @db.Decimal(12,2) @default(0)
  updatedAt DateTime @updatedAt
  @@map("earnings_accounts")
}
```
Raw-SQL CHECKs: all amounts ≥ 0; `payee_amount + commission_amount = amount`.

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `GET /api/payments/booking/:bookingId` | payer, payee | the payment with breakdown and available methods |
| `POST /api/payments/:id/promo` · `DELETE /api/payments/:id/promo` | payer | apply/remove; re-computes the amounts; usage is only consumed on success |
| `POST /api/payments/:id/pay-online` | payer | creates a gateway order → `{ orderId, keyId, amount }`; status PROCESSING |
| `POST /api/payments/:id/verify` | payer | `{ gatewayPaymentId, signature }` verified server-side (HMAC) → SUCCEEDED |
| `POST /api/payments/webhook/razorpay` | gateway | raw body, signature checked, idempotent |
| `POST /api/payments/:id/pay-cash` | payer | method CASH, stays PENDING |
| `POST /api/payments/:id/confirm-cash` | payee | → SUCCEEDED |
| `GET /api/payments/:id/receipt` · `/receipt.pdf` | payer, payee | only after SUCCEEDED |
| `GET/PUT /api/admin/pricing/commission` | ADMIN | 0–50 % |
| `GET/POST/PATCH /api/admin/promo-codes` | ADMIN | no hard delete; deactivate instead |
| `GET /api/admin/payments` | ADMIN | paginated |
| `POST /api/payments/mock/complete` | payer | only when `PAYMENT_PROVIDER=mock` and `NODE_ENV !== production` |

**Gateway interface** (`modules/payments/gateway/`): `createOrder({ amount, receipt, notes })`, `verifySignature(payload)`; providers `mock` (default) and `razorpay` (test keys from env; amount converted to paise as an integer).

**Amount strategies:** `registerAmountStrategy('RIDE', booking => seatsBooked × costPerSeat)` is registered here; F07 registers `RENTAL`.

**Creation:** on `booking.completed` create the Payment (payee = driver or vehicle owner), snapshot the commission rate, status PENDING, notify the payer.

**Success transaction (one DB transaction):** mark SUCCEEDED and set `paidAt`; generate `receiptNumber` (`DH-YYYYMMDD-######`, from a DB sequence); increment `PromoCode.usedCount` with `WHERE usedCount < usageLimit` (fail the payment cleanly if the limit was just hit); create the `EarningEntry` and upsert `EarningsAccount` (`withdrawable` only for ONLINE; cash entries add to `totalEarned` only); emit `payment.succeeded`; notify PAYMENT_RECEIPT.

## 5. UI
`PaymentPage` (breakdown, promo input, choose Online or Cash, checkout modal using Razorpay Checkout or the mock) · `ReceiptPage` (print + PDF download) · driver/owner "Confirm cash received" action in bookings · admin `CommissionPage` and `PromoCodesPage`. Wire the "Receipt" button in `MyBookingsPage` (F05).

## 6. Business rules & edge cases
- Money uses `Prisma.Decimal`; commission = round half-up(amount × rate / 100); payee = amount − commission.
- A payment is created once per booking (unique `bookingId`); handlers must be idempotent (repeated verify or webhook calls do not double-credit earnings).
- Never store card details or raw gateway secrets; never log full gateway payloads.
- Promo validation: active, within dates, `amount ≥ minAmount`, under usage limit; PERCENT capped by `maxDiscount`; discount never exceeds the base amount.
- Only the payer can pay; only the payee can confirm cash.

## 7. Phases
### Phase 1 — Data layer & pricing config
Tasks: models, migration, receipt-number sequence, singleton seed, admin commission endpoints.
Done when: CHECK constraints and singleton behave as specified.

### Phase 2 — Gateway abstraction & payment creation
Tasks: gateway interface with mock and Razorpay adapters, `registerAmountStrategy`, RIDE strategy, creation on `booking.completed`.
Done when: completing a ride creates exactly one Payment with correct snapshots.

### Phase 3 — Pay online / cash, verification, webhook
Tasks: endpoints, signature verification, idempotent success transaction, earnings credit.
Done when: replaying verify/webhook leaves balances unchanged.

### Phase 4 — Promo codes & receipts
Tasks: promo admin CRUD, apply/remove, usage accounting, receipt JSON and PDF.
Done when: boundary tests pass (expired, over limit, below minimum, discount cap).

### Phase 5 — UI, tests, feature review
Tasks: pages above; API tests including tampered signature and concurrency on promo usage; UI smoke test; full review plus section 8.

## 8. Feature-specific review checklist
- Are all amounts computed with Decimal and rounded consistently?
- Is the signature verified before any state change, with constant-time comparison?
- Is double-processing impossible (unique constraints, status checks, row locks)?
- Can a user pay or confirm cash for someone else's booking?
- Are secrets and gateway payloads kept out of logs and responses?

## 9. Definition of Done
REQ-4.7.1–4.7.4 met · idempotency tests pass · earnings ledger credited correctly for online and cash · logs and status updated.
