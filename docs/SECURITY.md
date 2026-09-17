# Security model

## Assets and trust boundaries

The public browser demo owns an in-memory synthetic delivery model and a locally generated JSON export. It has no accounts, secrets, backend connection or file import. Its payload textarea is still untrusted input: it can contain markup, nested structures or an oversized event. React renders payloads with text nodes; nothing reaches `innerHTML`, `eval`, an interpreter or a third-party server.

The local service owns its SQLite file, receipt/effect invariants, HTTP event intake and in-memory receiver token. Its boundary is a loopback socket, **not** an authenticated network API. A malicious webpage, a local unprivileged process, arbitrary HTTP input and an accidental duplicate request are considered. A process that can modify this repository, inspect service memory or alter the SQLite file is outside the protected boundary.

## Threats, mitigations and evidence

| Threat                                            | Concrete implementation                                                                                                                                          | Test evidence                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Browser CSRF / DNS rebinding against localhost    | Bind 127.0.0.1; exact runtime `Host` with one value; reject every Origin including `null`; reject cross-site fetch metadata; no CORS headers; JSON-only mutation | `service.test.ts`: hostile Origin/Host, content type, receiver access                         |
| SSRF / redirected delivery                        | No destination parameter; producer fetches its own exact loopback receiver URL; redirects rejected; unknown envelope fields rejected                             | Policy unknown-field case; service receiver path exercised                                    |
| Payload XSS                                       | React text rendering; JSON `<pre>` is text; no raw HTML                                                                                                          | Playwright HTML-like custom payload remains text; no image element created                    |
| Conflicting idempotency reuse                     | ID-scoped full canonical JSON comparison; same receipt or 409; numeric property ordering covered                                                                 | Policy and actual HTTP canonical numeric-key regressions                                      |
| SQL injection                                     | Prepared statements with bound data; static schema SQL only                                                                                                      | Arbitrary payload accepted as data, restricted ID; implementation review                      |
| Duplicate receiver effect after concurrency/crash | Receipt and effect inserted together; unique event keys; serial process promise; unfinished attempt replay                                                       | Concurrent HTTP calls and fault injection after receiver commit followed by persisted restart |
| Memory/CPU/disk growth                            | 32 KiB streamed-body count, 16-level payload depth, 100-event cap, four logical attempts, 32 HTTP connections, 8 KiB headers, 5s request/socket bounds           | Oversized complete/streamed bodies, deep JSON, durable/session capacity tests                 |
| Compressed/invalid request confusion              | No compressed bodies; strict JSON media type, fatal UTF-8 decoding, method/route allowlists                                                                      | Malformed JSON, content encoding and unsupported methods/routes tests                         |
| Fake direct receiver success                      | Process-random 32-byte receiver token; validate matching pending attempt and payload                                                                             | HTTP receiver access without token rejected                                                   |

Tests do not prove immunity to every parser, operating-system or dependency vulnerability. Timeouts reduce resource retention; a determined local caller can reconnect, consume all 100 entries or occupy 32 sockets. No per-client rate limiting or authentication is implemented.

## Browser policy

Production assets are same-origin and bundled. No external fonts, analytics, telemetry, runtime CDN, remote images or provider requests. Downloads use a short-lived Blob URL. The static host controls response headers; this project does not pretend that Vite config configures GitHub Pages headers. The production build inserts a meta CSP limiting scripts/assets to same-origin and denying network connections, objects, base URLs and form submissions. Inline styles are allowed for React presentation. Meta CSP cannot supply a `frame-ancestors` policy; framing protection requires host response headers. No production CSP header is supplied by the app itself. The API replies with `nosniff`, `no-store` and a `default-src 'none'; frame-ancestors 'none'` CSP for its JSON responses. Development Vite uses local HMR; it is not a production security boundary.

There is no browser persistence to validate or repair. SQLite uses a schema version and rejects unknown versions; the file itself is trusted local state, not an import format. Export version 1 is documented; importing exports is not implemented.

## Residual risk and scope

- Any local process can call the public intake/process API without credentials. Host/Origin checks protect against common browser request paths, not a malicious native process able to forge headers.
- No TLS, user authentication, authorization, request signing, replay window, internet-facing rate limit, tenant separation, encryption at rest or distributed worker lease is implemented.
- One process per database is required. The same-path in-process guard is not a cross-process lock. SQLite durability depends on OS/filesystem behavior and backups are absent.
- The “effect” is a synthetic row in the same database as its receipt. External money movement, emails or third-party actions would require different guarantees.
- Node 24.19's built-in SQLite API is a release candidate (stability 1.2). Follow supported releases and review upgrades; exact npm resolution is committed in the lockfile.
- Do not expose the local service with a tunnel, public reverse proxy or wildcard bind without designing an authenticated production boundary.

## Reporting

For a non-sensitive issue, use this repository's issue tracker once published. For a sensitive vulnerability, use GitHub's private vulnerability reporting if enabled; otherwise ask the maintainer for a private channel without posting exploit data or secrets. No unverified contact address is provided.
