# F08 — Earnings & Cash-out

- **SRS:** REQ-4.5.3, REQ-4.5.4; Section 2.3 (Driver: daily/weekly/monthly earnings, instant bank cash-out) · **Priority:** Medium
- **Depends on:** F06 (ledger), F07 (rental earnings flow through the same ledger) · **Class diagram:** `Driver` (viewEarnings, cashOutEarnings, totalEarnings)
- **Follow:** AGENTS.md.

## 1. Goal
Drivers and vehicle owners see earnings by day, week and month and can cash out their withdrawable balance to a bank account instantly, without ever losing or duplicating money.

## 2. Scope
**In:** earnings summary and reports, bank account records, cash-out requests with a payout provider abstraction (mock), reconciliation job, notifications.
**Out:** real payout provider integration, tax documents, refunds, disputes.

## 3. Data model
Uses `EarningEntry` and `EarningsAccount` from F06. Add:
```prisma
enum CashOutStatus { PROCESSING PAID FAILED }
model BankAccount {
  id String @id @default(uuid())
  userId String
  holderName String
  bankName String
  last4 String @db.VarChar(4)                   // the full account number is NEVER stored or logged
  providerRef String                            // opaque token from the payout provider (mock generates one)
  isDefault Boolean @default(false)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  @@index([userId])
  @@map("bank_accounts")
}
model CashOutRequest {
  id String @id @default(uuid())
  earnerId String
  bankAccountId String
  amount Decimal @db.Decimal(12,2)
  status CashOutStatus @default(PROCESSING)
  idempotencyKey String @unique
  payoutRef String?
  failureReason String?
  requestedAt DateTime @default(now())
  processedAt DateTime?
  @@index([earnerId, requestedAt])
  @@map("cash_out_requests")
}
```
Raw-SQL CHECKs: `amount > 0`; `earnings_accounts.withdrawable_balance >= 0`.

## 4. API contract
| Method & path | Who | Notes |
|---|---|---|
| `GET /api/earnings/summary` | self | `totalEarned`, `withdrawableBalance`, `pendingCashOut`, `cashEarnedNotWithdrawable`, split by source (RIDE/RENTAL) |
| `GET /api/earnings/report` | self | `granularity=day\|week\|month`, `from`, `to` (default last 30 days / 12 weeks / 12 months); grouped with `date_trunc` in `Asia/Kolkata`; gaps filled with zeros; split by source and method |
| `GET /api/earnings/entries` | self | paginated ledger |
| `POST/GET/DELETE /api/bank-accounts` | self | POST takes the full number once, keeps only `last4` and a provider token |
| `POST /api/cashouts` | self | header `Idempotency-Key` required; `{ amount, bankAccountId }` |
| `GET /api/cashouts` | self | history, paginated |

**Cash-out transaction (REQ-4.5.4):**
1. Replay check: if the `idempotencyKey` exists for this user, return the stored request.
2. In one transaction: `SELECT ... FOR UPDATE` on the `earnings_accounts` row; check `amount ≤ withdrawableBalance` and `amount ≥ MIN_CASHOUT` (100); debit the balance; insert the request as PROCESSING.
3. After commit call `payoutProvider.payout({ amount, providerRef, reference })` (provider `mock` by default; env `PAYOUT_FAIL_RATE` allows failure tests).
4. Success → status PAID, `processedAt`, `payoutRef`, notify CASHOUT_PROCESSED. Failure or exception → compensating transaction that credits the balance back and sets FAILED with a reason.
5. `jobs/reconcileCashouts.js` (every 5 minutes): requests PROCESSING for more than 5 minutes are failed and refunded the same way.

## 5. UI
`EarningsDashboardPage` (summary cards, Day/Week/Month toggle with a Recharts bar chart, source breakdown, ledger table) · `CashOutPage` (bank account list/add, amount input with "withdraw all", confirmation modal, history with status chips) · cash earnings are displayed with a note that they were collected directly and are not withdrawable.

## 6. Business rules & edge cases
- Only ONLINE payments are withdrawable; CASH earnings appear in reports but not in the balance (already collected in hand).
- Cash-out never exceeds the balance, even with concurrent requests (row lock) or retried requests (idempotency key).
- Earnings visible only to their owner; admins have no endpoint here.
- Amounts are Decimal, two places. Bank details are never written to logs.
- A user with no earnings account sees zeros, not errors.

## 7. Phases
### Phase 1 — Data layer & bank accounts
Tasks: models, migration, bank account endpoints with last-4 handling and a mock tokenizer.
Done when: the full account number is not present in the database, responses or logs (verify with a grep test).

### Phase 2 — Earnings summary & reports
Tasks: summary, report (`date_trunc` in IST with gap filling), entries.
Done when: report tests pass around midnight IST and month boundaries.

### Phase 3 — Cash-out engine
Tasks: transaction with row lock, idempotency, payout provider abstraction and mock, compensation on failure, reconciliation job, notification.
Done when: 10 parallel cash-outs for a balance that covers 3 yield exactly 3 successes; forced provider failure restores the balance.

### Phase 4 — UI, tests, feature review
Tasks: both pages; API and concurrency tests; UI smoke test; full review plus section 8.

## 8. Feature-specific review checklist
- Can the balance ever go negative or be debited twice for one request?
- If the process dies after the debit, does the reconciliation job restore the money?
- Is any bank number, token or payout payload logged?
- Do reports agree with the ledger totals?
- Is `Idempotency-Key` validated and scoped per user?

## 9. Definition of Done
REQ-4.5.3–4.5.4 met · money-safety tests pass · logs and status updated.
