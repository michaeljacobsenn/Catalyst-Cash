# Catalyst Cash Upgrade Backlog

This file tracks the work required to move the app toward a true top-tier consumer finance product.

## Scoring Target

- Current working score: `99/100`
- Near-term target: `100/100`
- Long-term target: `100/100`

## Priority 1: Product Trust And Core Loop

- [ ] Reduce the app to a crystal-clear weekly loop: status, next action, optional drill-down.
- [ ] Re-rank dashboard content so the first screen answers "Am I safe?" in under 3 seconds.
- [ ] Replace hype-heavy wording with calm, high-trust financial language.
- [ ] Standardize page headers, back behavior, and overlay behavior across all major screens.
- [ ] Audit all empty states and first-run states for clarity and conversion.

## Priority 2: Engineering Hardening

- [x] Make `npx tsc --noEmit` pass cleanly.
- [ ] Fix app-shell typing and event/ref safety in [src/App.tsx](/Users/michaeljacobsen/Desktop/PortfolioPro%20Public/src/App.tsx).
- [ ] Resolve prop contract drift between root shell and major tabs.
- [ ] Eliminate optional-property mismatches caused by `exactOptionalPropertyTypes`.
- [x] Add regression coverage for shell navigation, overlays, and tab/header behavior.
- [x] Add trust-critical end-to-end coverage for backup/restore, app lock, and mocked Plaid linking.
- [x] Add unhappy-path Plaid coverage for exit, exchange failure, and reconnect-required states.
- [x] Migrate Plaid transaction sync from `/transactions/get` to cursor-based `/transactions/sync`.
- [x] Add regression coverage for first-sync and incremental cursor merge behavior in the Cloudflare Worker.

## Priority 3: AI And Financial Decisioning

- [x] Move more financial decisions from prompt text into deterministic native logic.
- [x] Add a native audit-signal layer so prompts anchor scoring and risk detection to deterministic app logic.
- [x] Shrink duplicated provider prompt instructions with a shared provider directive builder.
- [x] Split prompt concerns by task.
- [x] Separate "calculation", "risk detection", and "coaching tone" into different layers.
- [x] Add stronger validation around prompt inputs and AI outputs.
- [ ] Move more output formatting responsibility from prompts into native normalization and rendering rules.
- [ ] Benchmark AI cost, latency, and output variance across audit and chat paths.
- [x] Re-rank the dashboard around a deterministic "Am I safe?" state instead of leading with vanity metrics.

## Priority 4: UX Polish And Performance

- [ ] Reduce cognitive load on dashboard and settings.
- [x] Reduce cognitive load on deeper finance/settings surfaces with summary-first layout.
- [ ] Tighten spacing, contrast hierarchy, and typography consistency.
- [x] Profile bundle size and trim first-load weight.
- [x] Push the main startup chunk below `280 kB gzip` while keeping build output warning-free.
- [ ] Remove dead state/legacy navigation code from the shell.
- [ ] Add motion rules so animations feel deliberate, not omnipresent.

## Current Sprint

- [x] Keep the global header static while content scrolls.
- [x] Add a persistent upgrade backlog in the repo.
- [x] Reduce first-wave App shell TypeScript risk.
- [x] Re-run typecheck and identify the next highest-leverage error cluster.
- [x] Type the portfolio editing surfaces so cards/accounts stop falling back to `{}`.
- [x] Unify portfolio section collapse-state contracts across the portfolio shell.
- [x] Normalize optional-field handling in renewals and annual-fee derived records.
- [x] Harden add-account entry styling and numeric form coercion.
- [x] Harden card-wizard flows against remaining type drift.
- [x] Tighten transaction-feed context and render contracts.
- [x] Tighten form/input typing in `InputForm`.
- [x] Stabilize Ask AI message contracts and prompt trust language.
- [x] Tighten settings-shell typing and configuration update contracts.
- [x] Remove residual type drift in paywall, onboarding import, simulators, weekly challenges, and shared UI primitives.
- [x] Normalize AI health-score grading/trend output so bad model formatting cannot leak into the app.
- [x] Reduce audit prompt duplication so more context window is spent on the user snapshot instead of repeated provider rules.
- [x] Re-introduce high-value provider-specific directives through config instead of restoring duplicated prompt branches.
- [x] Split the audit prompt into explicit calculation, risk-detection, and coaching layers.
- [x] Preserve liquid net worth from model output instead of dropping it at parse time.
- [x] Normalize dashboard rows natively so milestone logic and UI do not depend on perfect LLM row ordering.
- [x] Normalize optional audit sections natively so prompts no longer need inline example keys or exact presentation ordering.
- [x] Add a native dashboard safety model and move the top of the dashboard to safety-first decisioning.
- [x] Add Playwright end-to-end coverage for onboarding, audit, results, chat, and settings persistence.
- [x] Broaden Playwright coverage to include restored sessions, audit failure handling, and import success/error paths.
- [x] Add trust-critical Playwright coverage for encrypted backup restore, pre-shell app lock, and mocked Plaid account linking.
- [x] Fix broken settings-to-backup wiring so export/import actions are reachable from the live Backup screen.
- [x] Prevent the main shell from rendering underneath the app lock screen.
- [x] Add semantic accessibility labels to security toggles and the lock screen for reliable automation and screen-reader clarity.
- [x] Add an always-visible secondary demo entry point in Audit and mark demo state clearly when sample data is active.
- [x] Add Plaid unhappy-path coverage for cancel, token-exchange failure, and reconnect-required account state.
- [x] Add visible inline Plaid failure messaging instead of relying on transient toast-only errors.
- [x] Remove mixed static/dynamic import warnings from `dateHelpers.js` and `securityKeys.js`.
- [x] Code-split `DashboardTab`, `InputForm`, and `ResultsView` to reduce first-load bundle weight.
- [x] Move Plaid helpers out of the boot path and lazy-load setup/guide/lock surfaces that are not needed on first render.
- [x] Add Playwright coverage for audit-result persistence across navigation, saved-audit restore on reload, and clean replacement of imported audits.
- [x] Expand deterministic chat decision rules beyond the original four threshold triggers.
- [x] Add prompt-injection detection before chat requests reach the model.
- [x] Add deterministic chat fallback responses for blocked, empty, malformed, and failed chat outputs.
- [x] Re-anchor materially wrong model health scores to deterministic native score signals.
- [x] Add boundary coverage for the expanded rule engine, prompt safety context, parser plausibility correction, and chat fallback layer.

## Notes

- Do not add major new features until shell quality, trust, and type safety improve.
- Compete on clarity and reliability first, not raw feature count.
- Current TypeScript hotspot count: `0` errors remaining.
- Current Playwright end-to-end coverage: `18` passing flows, including audit-history persistence, backup/restore, app lock, and Plaid happy/unhappy paths.
- Current Vitest coverage: `360` passing tests across `25` files, including worker cursor-sync integration coverage and chat-safety regression coverage.
- Build output is clean: `npm run build` completes with no import-splitting warnings.
- Initial app chunk before bundle pass: `491.50 kB` / `139.28 kB gzip` in `dist/assets/index-DlBDAm3y.js`.
- Initial app chunk after bundle pass: `343.72 kB` / `101.01 kB gzip` in `dist/assets/index-BGBn4NfJ.js`.
- Initial app chunk after second bundle pass: `246.07 kB` / `73.74 kB gzip` in `dist/assets/index-CmuHoRa_.js`.
- First-load weight removed from the main chunk by code splitting:
  `InputForm` `53.72 kB` / `13.31 kB gzip`
  `DashboardTab` `44.64 kB` / `13.08 kB gzip`
  `ResultsView` `18.57 kB` / `5.74 kB gzip`
- Additional startup surfaces now split from the main chunk:
  `SetupWizard` `60.59 kB` / `17.10 kB gzip`
  `LockScreen` `9.43 kB` / `3.48 kB gzip`
  `GuideModal` `2.73 kB` / `1.30 kB gzip`
- Latest main app chunk after prompt/chat hardening: `246.99 kB` / `74.04 kB gzip` in `dist/assets/index-BJQDY21E.js`.
