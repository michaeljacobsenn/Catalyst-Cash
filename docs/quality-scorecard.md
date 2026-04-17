# Quality Scorecard

This repo reaches a defensible `95+` only when both the execution gates and the structural gates are clean.

## Runtime gates

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:e2e:smoke`
- `npm run test:e2e:critical`
- `npm run perf:check`

## Structural gates

- Files over `500` lines: `<= 20`
- Files over `800` lines: `<= 8`
- Files over `1000` lines: `<= 4`
- Files over `1500` lines: `0`
- Explicit `any` in production TS/TSX: `<= 5`
- `@ts-ignore`, `@ts-expect-error`, `eslint-disable`: `<= 2`
- Decorative banner comments: `0`
- `TODO`, `FIXME`, `HACK`, `XXX` markers in production code: `0`
- Test-to-production file ratio: `>= 0.35`

## Baseline command

- `npm run quality:scorecard`

Use `npm run quality:scorecard -- --check` to fail when the repo misses the current 95+ thresholds.
