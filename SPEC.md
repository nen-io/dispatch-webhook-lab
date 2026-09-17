# Dispatch — Webhook delivery laboratory

This document defines the behavior and acceptance criteria. All demonstration data is synthetic. The demo runs without a login or API key.

## Product and visual design
A deep navy operations console with coral/teal delivery lanes and a large chronological attempt ledger. Make retry policy and duplicate handling observable. Static browser mode is clearly labelled simulation; actual Node service is included and tested.

## Model and rules
Event {id,payload,createdAt}; delivery {eventId,state,attempts,nextAttemptAt}. States pending,delivered,dead. At most 4 attempts with deterministic backoff delays 1s,2s,4s after failures. 2xx succeeds; 408,429 and 5xx retry; other 4xx permanent failure. Empty/invalid IDs and payloads rejected, <=32KiB request. Idempotency scoped to eventId: same ID+canonical payload duplicate returns same receipt without another effect; reused ID with different payload is conflict 409. Distinguish at-least-once delivery attempts from exactly-once local receiver effect.

## Required behavior
1. Seed buttons create immediate success, fail-twice-then-success, permanent rejection and retry-exhaustion scenarios. Simulation runs same pure policy functions as backend. Advance deterministic virtual clock explicitly or auto-run with pause/reset; display simulated time accurately.
2. Inspect payload, attempt response, retry due time, event state and receiver effect count. Duplicate existing event demonstrates no duplicate effect; changed payload conflict visible.
3. Actual local Node HTTP service binds 127.0.0.1 by default. SQLite stores events, attempts and receiver receipts, survives close/reopen. Routes documented: health; POST events; GET events; POST process due (or controlled worker). Local producer/receiver deliver actual HTTP only to fixed loopback endpoint, never arbitrary user URL (avoid SSRF scope). Include no third-party services.
4. Atomic claim/record or serial processing prevents concurrent due-processing from duplicating receiver effects. Receiver receipt insertion and effect persisted atomically. Retry attempt persists before observable scheduling; explain crash/retry boundary.
5. Restart test uses persisted SQLite path, not only in-memory. Requests validate JSON, methods and body bounds. Expose clear API errors. Clean shutdown closes DB/server.
6. Browser demo has no fake live server badges. Optional local API mode only if genuinely connected; not required for static demo. Export simulation event log JSON.
7. No authentication, internet exposure or production delivery claims; document deliberate local lab scope.

## Acceptance tests
- D1: policy success, transient sequence, terminal4xx,4-attempt exhaustion and exact due boundaries.
- D2: identical duplicate no new effect, different payload conflict; canonical property order stable.
- D3: service integration tests actual HTTP status codes and payload limits, malformed bodies and unsupported route.
- D4: persisted restart keeps pending work and dedup receipts; repeated/concurrent process requests cannot duplicate effects.
- D5 browser: generate each scenario, advance/pause/reset, inspect attempt, duplicate delivered event and export.
## Documentation
Architecture diagram, API examples, run commands for static demo and local service, delivery guarantee explanation, crash boundaries, SQLite decisions and reproducible restart test.

## Completion gate
Implement the behavior and acceptance tests above; document any deliberate limitation. `npm run check` and `npm run test:e2e` must pass. Independently review the code and exercise the production build before release. Verify the public demo at its GitHub repository subpath.

## Refinement contract — 17 September 2026

- Next due attempt advances to the earliest pending timestamp, processes every event due at that instant, and pauses auto-run for inspection. With no pending events it is disabled and does not move the clock. Existing +1s behavior stays available.
- Ledger search matches ID, event type or scenario case-insensitively; the state filter combines with search. Show matching/total counts and clear controls. Filtering never changes processing, receipts or JSON export. If selected delivery leaves the filter, preserve the inspector and explicitly label that situation.
- Duplicate feedback claims a committed receiver receipt only when a receiver effect exists. Pending/dead duplicates reuse their existing delivery without inventing a receipt.
- Regression evidence includes exact 0/1/3/7-second backoff, no-op idle stepping, paused stepping, pending/dead duplicate feedback, filtered inspector continuity, complete export and narrow/2× text layouts.
