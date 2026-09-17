# Scalability and resource limits

This is a bounded laboratory, not a benchmark claim. No throughput or latency measurements have been taken; build timings and test durations are not capacity results.

## Implemented limits

| Limit                                                                    | Rationale and overload behavior                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 100 events/session or database                                           | Keeps full-history UI and API understandable; new event returns 429 at capacity, identical duplicates still resolve                   |
| 32 KiB JSON request                                                      | Bounds buffering and canonicalization; oversized streamed or complete request returns 413                                             |
| 16 nested JSON levels                                                    | Bounds recursion; excessive nesting returns 400                                                                                       |
| 64-character IDs                                                         | Bounds receipt keys and readable UI; invalid IDs return 400                                                                           |
| Four recorded logical attempts/event                                     | 400 logical attempt rows maximum; terminal failure enters dead state; crash can resend unfinished attempt                             |
| 32 simultaneous HTTP connections                                         | Bounds open socket concurrency; Node refuses additional connections; client may receive connection failure rather than structured 429 |
| 8 KiB request headers, 32 stored header fields; 5s request/socket bounds | Bounds common parsing/retention paths; Node can reject oversized headers or close a slow connection                                   |
| 2s fixed receiver fetch timeout                                          | A hung loopback fetch becomes recorded transport status 0 and follows retry policy                                                    |

`maxHeadersCount` is Node's stored-header limit, not a promise of a custom rejection for every excess header. No rate limiter or durable queue of HTTP callers is present. `/process` snapshots due events, performs them serially, and shares the same promise with concurrent callers. If processing exceeds a client/socket timeout, work may continue and clients must inspect durable state; receipts remain deduplicated.

## Costs

Let `n≤100` events, `a≤4n` attempts, and `p≤32 KiB` payload bytes. Browser lookup, immutable delivery mapping and derived counts are O(n); history rendering is O(n+a) with a bounded scrolling ledger. Canonicalization sorts keys recursively: O(k log k) at each object with k keys, plus traversal of the bounded payload. Memory is O(n·p+a). A maximum-size 100-event session can hold several megabytes plus JS/DOM overhead.

SQLite queries use indexed receipt IDs and `(state,nextAttemptAt)` for due selection. Each cycle performs up to n sequential HTTP calls plus synchronous short SQLite transactions. `GET /events` includes every payload and performs bounded per-event attempt/effect queries (an intentional N+1 pattern at this scale). The largest response can be several megabytes. JSON encoding, synchronous SQLite and a single event loop are first bottlenecks. WAL adds files and durability overhead; no cache hides authoritative receipt state.

## At 10×: proposed, not implemented

At 1,000 events, replace full-list reads with cursor pagination and aggregate counts, batch attempt/effect retrieval, and virtualize ledger rows. Separate payload storage from compact operational metadata. Add retention/archive operations preserving idempotency decisions for an explicitly chosen window. Measure render interaction latency, query cost and memory with realistic maximum payloads before changing engines. Move synchronous DB work to a dedicated worker if event-loop delay becomes material.

Add authenticated API clients, explicit per-client quotas and overload responses before external exposure. Limit worker batches so one call cannot monopolize processing. Benchmark a real network receiver; the current deterministic loopback receiver provides no evidence for external throughput.

## At 100×: proposed, not implemented

At 10,000+ events or independent producers, introduce a durable worker queue or database claim/lease with fencing, a transactional outbox, configurable bounded concurrency and indexes verified with query plans. Partition fairness by tenant/endpoint and define per-endpoint rate/burst budgets. Use randomized backoff and `Retry-After` handling to avoid synchronized storms. A replicated database may replace SQLite if availability/write concurrency requirements justify it.

Keep receiver idempotency decisions atomic with effects where possible. Moving receipts to a cache weakens guarantees unless eviction and recovery are designed. Distributed leases do not create exactly-once external side effects: require receiver-side idempotency, durable reconciliation and observability. Define retention, backups, restore tests and privacy controls before adding replicas or caches. These are design directions, not implemented features or experience claims.
