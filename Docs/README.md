# Feature index & status

Tick a box only after the phase's review and log entry are done (AGENTS.md section 6).
Run instructions for local development and Docker are in [RUNNING.md](RUNNING.md).

| ID | Feature | Depends on | P1 | P2 | P3 | P4 | P5 | Gate passed |
|----|---------|-----------|----|----|----|----|----|-------------|
| F01 | [Vehicle Management](F01-vehicle-management.md) | auth | [x] | [x] | [x] | [x] | n/a | [ ] |
| F02 | [Vehicle Documentation & Notifications](F02-vehicle-documentation.md) | F01 | [x] | [x] | [x] | [x] | n/a | [ ] |
| F03 | [Vehicle Verification & Admin Audit](F03-vehicle-verification.md) | F01, F02 | [x] | [x] | [x] | [x] | [x] | [ ] |
| F04 | [Post Ride & Search Ride](F04-post-and-search-ride.md) | F01, F03 | [x] | [x] | [x] | [x] | n/a | [ ] |
| F05 | [Ride Booking, Booking List & Tracking](F05-ride-booking.md) | F04 | [x] | [x] | [x] | [ ] | [ ] | [ ] |
| F06 | [Payments, Receipts, Commission & Promo](F06-payments.md) | F05 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| F07 | [P2P Listing & Hourly/Daily Rental](F07-p2p-listing-and-rental.md) | F03, F05, F06 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| F08 | [Earnings & Cash-out](F08-earnings-cashout.md) | F06 | [ ] | [ ] | [ ] | [ ] | n/a | [ ] |

## SRS traceability
| SRS section | Covered by |
|-------------|-----------|
| 4.1 Vehicle Management (REQ-4.1.1–3) | F01 |
| 4.2 Registered & Insured Vehicle Verification (REQ-4.2.1–4) | F03 (alerts REQ-4.2.4 built in F02) |
| 4.3 Vehicle Documentation (REQ-4.3.1–3) | F02 |
| 4.4 Carpooling (REQ-4.4.1–2) | F04 |
| 4.4 Carpooling (REQ-4.4.3–6) | F05 |
| 4.5 P2P (REQ-4.5.1–2) | F07 |
| 4.5 P2P (REQ-4.5.3–4) | F08 |
| 4.6 Hourly/Daily Rent (REQ-4.6.1–3) | F07 |
| 4.7 Payment (REQ-4.7.1–4) | F06 |
