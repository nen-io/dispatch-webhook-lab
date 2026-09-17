# Engineering and contribution standards

The behavior contract is in [SPEC.md](../SPEC.md). Architecture, security boundaries, scalability limits and decision records explain how to change the application without weakening its guarantees.

## Code and dependencies

Use strict TypeScript and keep domain rules separate from browser effects and React rendering. Prefer explicit validation, immutable transitions, bounded data structures and visible recovery over silent fallback. Comments explain invariants and tradeoffs. Keep source formatted and commit the npm lockfile. Consult official documentation when upgrading dependencies.

All fixtures and assets must be original or appropriately licensed. Never commit credentials, private product code, personal records, generated test artifacts or dependency directories. User-supplied content is data: do not execute it or interpolate it into HTML.

## User experience

Maintain labelled keyboard controls, visible focus, reduced-motion behavior and usable layouts from 320px to desktop widths. Test loading, empty, invalid and failed states alongside the main journey. User-visible counters and measurements must derive from real application state. Simulation boundaries must remain explicit.

## Verification

Run `npm ci`, `npm run check` and `npm run test:e2e`. Install the matching Chromium build with `npx playwright install chromium` first. Domain tests should check observable invariants; browser tests should assert outcomes, including recovery after malformed input and interrupted work. Add regression tests when fixing correctness defects.

Do not infer security, performance or browser compatibility from a successful build. Record executed checks and their limits in [TESTING.md](TESTING.md). Screenshots in `docs/screenshots/` must come from representative running application states.

## Documentation and release

Keep the README walkthrough, schema, limits and scripts aligned with implementation. Significant choices belong in [DECISIONS.md](DECISIONS.md), including alternatives, consequences and a reason to revisit. Describe threats and concrete mitigations in [SECURITY.md](SECURITY.md); distinguish implemented limits from proposed larger-scale designs in [SCALABILITY.md](SCALABILITY.md).

GitHub Actions verifies typechecking, domain/integration tests, the production build and Chromium journeys before publishing to Pages. Validate the deployed repository subpath and runtime assets separately from the development server. A release should be reproducible from a clean checkout; report the exact remote commit and any unverified assumptions.
