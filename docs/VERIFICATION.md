# Verification Workflow

Use this repo with one fast local verification lane and one matching CI lane.

## Required local checks before shipping

Run these from the repo root:

```bash
npm run lint
npm run typecheck
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
- `npm run typecheck`
  - Runs TypeScript in no-emit mode with plain output.
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
2. `npm run typecheck`
3. `npm run test:unit`
4. `npm run test:e2e:smoke`
5. `npm run test:e2e:critical`

That keeps local verification and CI aligned instead of having separate “works on my machine” paths.
