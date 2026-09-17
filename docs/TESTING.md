# Verification

## Executed checks

Executed locally on 17 September 2026 using Node 24.19.0, npm 11.17.0 and the pinned lockfile:

| Command / action                   | Result                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                    | Passed strict TypeScript, 16 Vitest tests across two files, and Vite production build                                            |
| `npm run test:e2e`                 | 3 Chromium journeys passed; real desktop and mobile screenshots written                                                          |
| `npm run service` + HTTP CLI smoke | Port 4403 health 200, intake 201, process 200; delivered event with one stored attempt and one effect; service stopped afterward |
| Independent parent browser review  | Desktop appearance inspected; no JS page errors or page overflow at 1440, 720, 390 and 320px in its checks                       |
| Independent parent axe scan        | Zero WCAG2/2.1AA violations on the initial state inspected; an automated sample, not accessibility certification                 |

The final browser journeys inspect actual outcomes and exported JSON, not only clickability. No permanently skipped tests. Vitest explicitly excludes Playwright files. Tests run against ephemeral disk-backed databases inside ignored `tests/.tmp`; they do not modify any personal data or the real service database.

## Acceptance map

| Requirement                                                               | Evidence                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1: success, transient recovery, terminal 4xx, exhaustion, exact due time | `tests/policy.test.ts`, `tests/service.test.ts`: boundaries 999/1000/3000/7000ms and real HTTP state                                                         |
| D2: duplicate effect suppression, canonical order, changed payload 409    | Pure nested/numeric/prototype-key tests; numeric-key actual HTTP regression; browser duplicate/conflict journey                                              |
| D3: request validation                                                    | Actual HTTP malformed JSON, wrong methods/routes, empty object, oversize complete and chunked payloads, unsupported media/encoding and Origin/Host rejection |
| D4: persistence, concurrency, crash ambiguity                             | Close/reopen same SQLite path; ten concurrent process requests; inject failure after actual HTTP receiver commit, reopen and replay without a second effect  |
| D5: interactive journey                                                   | Seed all four scenarios, manually advance, auto-run with controlled clock, pause, reset, inspect responses, duplicate delivered event and export parsed JSON |
| Adversarial/resource cases                                                | Invalid IDs, 16-level nesting boundary rejection, 100-event browser/database limits, unknown schema version, HTML-like content rendered as text              |
| UI state races                                                            | Reducer regression applies tick, custom ID that collides with generated sequence, then seed; clock remains advanced and ID remains unique                    |
| Responsive/keyboard/motion                                                | 320px overflow assertion, keyboard Enter action, reduced-motion media emulation, exact 2× computed text-size layout assertion at 720px                       |

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:e2e
```

Focused persistence and crash checks:

```sh
npx vitest run tests/service.test.ts -t 'persists retries across restart'
npx vitest run tests/service.test.ts -t 'replays an interrupted recorded attempt'
```

The second test starts a real service and actual loopback receiver, deliberately throws after the receiver transaction commits but before sender result storage, closes the service, opens the same disk file and replays the unfinished logical attempt. Assertions require one effect before and after recovery, a delivered state and one logical attempt. This tests the meaningful storage boundary; it does not simulate an OS power loss or prove hardware/filesystem durability.

## Screenshots

- `docs/screenshots/desktop.png`: 1440px wide, four populated scenarios, clock advanced to 1s, recovering event selected.
- `docs/screenshots/mobile.png`: 390px wide, same state, full page.

These are captured from the running app by the third Playwright test, and were visually inspected. They are documentation artifacts, not pixel-diff baselines. The test separately checks 320px. The text-size check doubles measured computed sizes before applying them, avoiding accidental 4× nested font multiplication; it is a layout stress test, not a claim of testing every browser zoom implementation.

## Limits of evidence

Chromium is covered; Safari/Firefox, assistive-technology interaction and physical phones were not tested. Axe only sampled the independently reviewed initial state. Keyboard smoke does not prove complete screen-reader usability. No penetration test, large-scale benchmark, network partition chaos run, external receiver, multi-process worker test or long-duration soak was performed. The simulated browser does not validate real API uptime. Unit/integration success is separate from public deployment and independent final review, which are owned by the parent publishing workflow.
