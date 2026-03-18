# Performance Notes

This repo now tracks route-level and startup-adjacent bundle budgets with:

```bash
npm run perf:profile
npm run perf:check
```

`perf:check` is CI-safe and fails on major regressions in the main entry, dashboard path, portfolio shell, and other heavy routes.

## Bundle impact from this pass

Measured from this repo's Vite build output:

| Chunk / path | Before | After | Impact |
| --- | ---: | ---: | ---: |
| `DashboardTab` | `53.34 kB` | `43.86 kB` | `-9.48 kB` |
| `PortfolioTab` shell | `150.09 kB` | `2.76 kB` | `-147.33 kB` |
| `CardPortfolioTab` | embedded in `PortfolioTab` | `64.87 kB` | split out |
| `CardWizardTab` | embedded in `PortfolioTab` | `44.62 kB` | split out |
| `SettingsTab` | `90.28 kB` | `90.29 kB` | flat |
| `SetupWizard` | `66.32 kB` | `66.32 kB` | flat |
| `main index` | `413.92 kB` | `413.99 kB` | effectively flat |

## What changed

- Deferred dashboard-only celebration code (`react-confetti`) until it is actually needed.
- Deferred native cloud-backup code from the dashboard until the backup action is triggered.
- Split portfolio shell from the heavy vault/rewards implementations so the tab shell becomes cheap to enter.
- Split portfolio investment, transaction, and add-account flows behind lazy boundaries.
- Deferred market-data code from the investments section with dynamic imports.
- Kept spreadsheet export behavior intact while ensuring `xlsx` remains off the hot path.

## What these numbers mean

- First switch into Portfolio is materially lighter because the shell is now tiny and the heavy vault/rewards views load on demand.
- Dashboard first render is smaller and avoids paying for celebration / backup code on cold boot.
- The main app shell chunk is still the largest remaining startup-weight item. That is now a deeper follow-up rather than a quick lazy-loading fix.
