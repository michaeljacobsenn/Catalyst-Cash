# Verification Workflow

Use this repo with one fast local verification lane and one matching CI lane.

## Required local checks before shipping

Run these from the repo root:

```bash
npm run lint
npm run prompts:check
npm run typecheck
npm run perf:check
npm run test:unit
npm run test:e2e:smoke
npm run test:e2e:critical
```

Or run the full lane:

```bash
npm run verify
```

## What each command does

- `npm run lint`
  - Lints `src`, `worker/src`, `scripts`, and the Playwright/ESLint config files.
  - Uses ESLint cache with content hashing for repeatable fast reruns.
- `npm run prompts:profile`
  - Prints repeatable audit/chat prompt size estimates for lean, median, and rich scenarios.
- `npm run prompts:check`
  - Runs the same prompt profile with enforced char/token budgets and fails on major prompt regressions.
- `npm run typecheck`
  - Runs TypeScript in no-emit mode with plain output.
- `npm run perf:profile`
  - Builds the app and reports key route chunk sizes plus shell/dashboard boot-weight estimates.
- `npm run perf:check`
  - Builds the app and fails if the enforced bundle/performance budgets regress.
- `npm run test:unit`
  - Runs the Vitest suite in CI mode with a compact reporter.
- `npm run test:e2e:smoke`
  - Builds the app and runs the core Playwright smoke path in Chromium against the built `dist/`.
- `npm run test:e2e:critical`
  - Builds the app and runs the deterministic critical-path Playwright suite covering onboarding, audit/results, settings rehydrate, backup restore, security lock, Plaid, household sync, and reduced-motion tab behavior.

## Developer expectations

- Use `npm run test:e2e:smoke` for release confidence on core app boot and audit-entry flow.
- Use `npm run test:e2e:critical` before shipping changes that touch onboarding, settings, audit/results, restore, Plaid, or navigation behavior.
- Use `npm run test:e2e -- tests/e2e/<file>.spec.ts` when iterating on a specific browser path.
- Use `npm run lint:fix` only for mechanical cleanup, then rerun `npm run lint`.
- Do not ship with a failing `verify` run.

## CI

GitHub Actions runs the same sequence on push/PR:

1. `npm run lint`
2. `npm run prompts:check`
3. `npm run typecheck`
4. `npm run perf:check`
5. `npm run test:unit`
6. `npm run test:e2e:smoke`
7. `npm run test:e2e:critical`

That keeps local verification and CI aligned instead of having separate “works on my machine” paths.
