# Paisa — Architecture

## Layout
```
packages/core    Pure TypeScript transaction engine (no I/O). Shared by app + backend.
db/migrations    PostgreSQL schema (17 tables, UUID PKs, dedupe constraints)
mobile           Expo / React Native Android app (Phase 1 UI, local SQLite)
backend          NestJS API (Phase 2 — not started)
docs             This file
```

## One engine, one definition of "spend"
Every source (Account Aggregator, notification, CSV, PDF, manual) emits a `RawTransaction`.
`ingest()` in `packages/core/src/engine.ts` runs the pipeline:

validate source → check consent → parse amount/date → direction → fingerprint → dedupe/merge →
categorise → refund/reversal link → own-account transfer link → (caller persists) → summaries.

`summary.ts` is the only place that decides what counts. Dashboard, analytics, reports and the AI
assistant must all call it, so they cannot disagree.

| Rule | Where enforced |
|---|---|
| Same txn never counted twice | `findDuplicate` (fingerprint, alt-fingerprints, reference, cross-source fuzzy) + DB unique indexes |
| Failed / pending never spend | `summarizeDay` counts `confirmed` only; pending shown separately |
| Own-account transfers excluded | `detectSelfTransfer` → `kind=self_transfer` |
| Refund nets spend, isn't income | `classifyRefundOrReversal` → `kind=refund`; range-level netting |
| Auto-reversal removes both legs | `kind=reversal`, debit `status=reversed` |
| Originals preserved | `originals[]` / `transaction_sources.payload` |
| Unknown app stays unknown | `paymentApp` only set by a source that identifies it |
| Unknown merchant → review | `categorize` returns `needsReview` |
| No consent → rejected | `validateSourceAndConsent` (AA + notification need an active consent) |

Money is integer paise. Day boundaries are IST (`dayKey`).

## Status
| Phase | State |
|---|---|
| 1 UI: splash, onboarding, local profile, biometric lock, Home dashboard, Transactions, manual entry, tabs | **Built** (typechecks, Android bundle compiles; not yet run on a device) |
| 2 Backend, auth, REST, CSV import | Schema done; NestJS not started |
| 3 Engine, dedupe, categorise | **Engine built + 28 tests**; analytics screens pending |
| 4 Account Aggregator | Not started — see below |
| 5 Notifications (Kotlin), budgets, reports, AI | Not started (monthly budget value already drives Home) |
| 6 Hardening, deploy, Play prep | Not started |

Placeholder tabs (Analytics, Budgets) are labelled with their phase; they show no fake data.

## Known limits (deliberate, documented)
- Phase 1 auth is **device-local** (SecureStore profile, no password, no server). The Profile
  screen and onboarding say so. Real register/login arrives with the backend.
- Demo data is generated on-device from `generateDemoRaw`, labelled "Sample data (demo)".
- Two genuinely identical, reference-less, same-day purchases from *different* sources may be
  merged; within one import they are kept apart by occurrence index.
- A refund arriving before its purchase is flagged for review rather than linked.
- Theme change cross-fades the screen; it is not a per-colour animated transition yet.

## What production Account Aggregator access needs (Phase 4)
Not available until you have: an RBI-regulated FIU registration, or a contract with a licensed
FIP/FIU partner (e.g. a TSP); partner API credentials + sandbox keys; registered redirect URIs;
consent-template approval; data-localisation and DPDP Act obligations reviewed. Until then the
adapter is `provider: 'sandbox'`, `is_sandbox = true`, and must be labelled in the UI.

## Google Play
Don't depend on SMS permissions. Notification-listener access is user-granted via system settings,
requires a prominent disclosure + privacy-policy entry, and yields only new events — never history.
