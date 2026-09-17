# Architectural decisions

## ADR1 — React view, pure model

**Context.** The demonstration needs attractive interaction, deterministic policy and identical browser/server classification.

**Alternatives.** Put delivery rules in React effects; use a full application state framework; duplicate rules in a backend.

**Decision.** Use React 19 with a pure domain module and one reducer ordering clock/input actions. Effects only own the interval lifecycle. Derive counts from the model. The service imports the same policy but owns actual persistence and transport.

**Consequences.** Tests exercise decisions without a DOM, and stale captured UI state cannot replace a queued clock tick. Simulator state still has a simpler effect model than the real receiver. A new policy must update shared contracts and both execution tests.

**Revisit.** If multiple user workspaces, remote subscriptions or long-lived background tasks are introduced, reconsider state ownership and explicit synchronization protocols before adding effects.

## ADR2 — Built-in SQLite and explicit local processing

**Context.** A reviewer should reproduce a restart with no credentials or external services. A purely in-memory queue would not demonstrate durability.

**Alternatives.** PostgreSQL/Redis containers; native third-party SQLite bindings; JSON-file persistence; memory only.

**Decision.** Use Node 24 `node:sqlite`, prepared statements, WAL, FULL synchronous durability, schema version 1 and short transactions. `/process` manually runs due work; no background daemon. The simulator uses a virtual clock; real service uses server wall time.

**Consequences.** Setup is small, but synchronous operations block the event loop and Node 24.19 marks the API as a release candidate. One process must own a file. No distributed worker, migrations beyond version 1, backup orchestration or automatic retention is claimed.

**Revisit.** Revisit when request concurrency, API stability, availability, growth or independently deployed workers require it; measure before selecting a replacement.

## ADR3 — Reserve before sending; deduplicate at the receiver

**Context.** An HTTP timeout cannot tell the producer whether the receiver applied an effect. A crash may occur after receiver commit but before producer acknowledgement storage.

**Alternatives.** Record only after sending; mark delivered before sending; claim all transport is exactly once; allocate a fresh attempt for every crash replay.

**Decision.** Persist a logical attempt reservation first, perform actual HTTP, atomically store response/schedule afterward. Replay an unfinished reservation after restart. The receiver inserts receipt and synthetic effect in one transaction keyed by event ID.

**Consequences.** Four logical attempts can produce more than four physical sends across crashes. This is honestly at least once transport. Receiver effect count remains one for identical payloads; arbitrary external side effects do not inherit the guarantee. Fault injection reproduces the ambiguous-acknowledgement boundary over actual HTTP.

**Revisit.** An external receiver requires a documented idempotency contract, signed delivery, timeout semantics and reconciliation; do not reuse the same guarantee text unmodified.

## ADR4 — Fixed loopback destination and no browser API mode

**Context.** A publicly hosted interactive portfolio must run without secrets, while a local service should not become an SSRF or browser-origin request target.

**Alternatives.** User-supplied webhook URLs; a public demo API; connect the static page to localhost; hide a mock behind a “live” badge.

**Decision.** Static browser simulation is clearly labelled. The real service binds 127.0.0.1 and delivers only to its own fixed receiver with a process token. Reject any Origin, cross-site fetch metadata and unexpected Host. Accept JSON only for mutation and reject compression.

**Consequences.** The service cannot demonstrate arbitrary integrations or browser CORS. Any local native process can still forge headers and call intake; there is no authentication. Scope is safer and inspectable without implying internet readiness.

**Revisit.** Public API or externally addressed receivers require authentication, authorization, DNS/IP validation, request signing, TLS, egress controls and abuse limits as a separate design.

## ADR5 — Bounded full-history rendering and serial work

**Context.** Small demonstrations become misleading when they pretend unlimited scale. Operational state should remain easy to audit.

**Alternatives.** Virtualization, distributed workers, concurrent delivery pools, unlimited database growth, elaborate pagination.

**Decision.** Enforce 100 events, 32 KiB request bodies, 16 JSON levels, four logical attempts and serial due processing. Render the bounded ledger directly and expose capacity failures. SQLite due queries are indexed; concurrent process callers share a promise.

**Consequences.** Simple ownership and reproducible failures outweigh throughput. Large API responses and N+1 listing queries are deliberate bounded tradeoffs. A timeout can end a caller's connection while processing continues. No benchmark numbers are implied.

**Revisit.** Before increasing limits by an order of magnitude, profile payload sizes, event-loop delay and rendering; introduce pagination/batches and only then concurrency with persistent leases.

## ADR6 — Canonical full payload equality

**Context.** An idempotency ID reused with subtly changed JSON must fail instead of overwriting a prior decision. Property insertion order should not change identity.

**Alternatives.** Raw `JSON.stringify` equality; cryptographic digest only; caller-supplied idempotency hash; compare only selected business fields.

**Decision.** Validate finite JSON values and bounded nesting, recursively sort object keys, preserve array order, and compare the full canonical serialized payload. The same function is used at intake and receiver reservation validation.

**Consequences.** No hash collision reasoning is needed and numeric/prototype-like keys are data, not special behavior. Values such as 1 and 1.0 compare equal after JSON parsing, as expected. JSON duplicate key names follow the parser's final value; byte identity is not a promise. Small bounded payloads make full strings affordable.

**Revisit.** For large binary payloads, define a canonical envelope/digest algorithm and independently validate its collision and serialization assumptions before changing receipt identity.
