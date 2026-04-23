# App Store Connect Runbook

Use this after the repo gates are green and the backend/site changes are already live.

## Current state as of April 23, 2026

- Production config is live with `gatingMode: "live"` at `https://api.catalystcash.app/config`
- Repo gates passed on this machine: `lint`, `typecheck`, and `test:e2e:critical`
- Latest signed App Store Connect upload sent from this machine: build `49`
- App: `Catalyst Cash`
- Bundle ID: `com.jacobsen.portfoliopro`
- Version: `2.0.0`
- Public TestFlight group now points only to build `49`
- Build `49` is attached to `iOS App Version 2.0.0`
- Build `49` is approved for external testing and live on the public TestFlight link
- Corrected iPhone 6.5-inch App Store screenshots are uploaded with the current app icon
- Privacy policy is live at `https://catalystcash.app/privacy` with the April 23, 2026 update
- Support / beta feedback email: `support@catalystcash.app`

## Minimal manual actions left

### 1. Complete App Store Connect declarations and submit

1. Save Content Rights once the final legal representation is confirmed.
2. Update App Privacy from `Data Not Collected` to match the live privacy policy and production telemetry behavior.
3. Complete Digital Services Act setup if Apple requires trader/contact information for the account.
4. Click `Add for Review` only after the declarations are complete.

### 2. Monitor public TestFlight

1. Confirm the public link is still `https://testflight.apple.com/join/3rpWQq49`.
2. If Apple shows a tester notification action, use it.
3. Watch incoming public-test feedback for build `49`.

### 3. Confirm IAP state in App Store Connect

Confirmed in App Store Connect:

- `com.catalystcash.pro.monthly.v2`
- `com.catalystcash.pro.yearly.v2`
- `com.catalystcash.pro.lifetime.v2`

All three are currently `Ready to Submit`, and all three are already set to `submitWithNextAppStoreVersion = true`. That means they are configured to ride with the `2.0.0` app submission once you click `Add for Review`.

### 4. Confirm RevenueCat production mapping

In RevenueCat, verify:

- entitlement ID is exactly `Catalyst Cash Pro`
- the active/default offering contains monthly, yearly, and lifetime products
- each RevenueCat product maps to the matching App Store product ID above

### 5. Confirm Gemini billing

In Google Cloud / AI Studio, verify:

- billing is active for the production Gemini project
- monthly budget alerts are enabled
- quota is sufficient for public TestFlight traffic

### 6. Run physical-device smoke

Run the checks in [IOS_LAUNCH_CHECKLIST.md](/Users/michaeljacobsen/Desktop/PortfolioPro%20Public/docs/IOS_LAUNCH_CHECKLIST.md) before final App Review.

## Paste-ready TestFlight copy

### Beta App Description

Catalyst Cash helps you run a faster weekly money check-in. In this public TestFlight build, test onboarding, the first audit, cash-flow and bills, Pro purchase or restore, offline launch, and backup or restore.

### Feedback Email

`support@catalystcash.app`

### What To Test

Focus on the first weekly audit, subscribe or restore, relaunch, and day-two reliability. Please test Pro unlock, offline launch, backup or export, restore, and manual or Plaid account paths. Include device model, iOS version, screenshots, and exact repro steps in feedback.

## Paste-ready review notes

### TestFlight Review Notes

No account signup or login is required. Reviewers can complete onboarding with manual entry or Load Demo Data and do not need to link a bank account. Plaid linking is optional. Primary flows are onboarding, first audit, dashboard/results, weekly briefing, offline handling, encrypted backup/export, restore, and subscription purchase or restore. User data is stored locally on device. Network calls are limited to optional AI and provider features.

### App Review Notes

No account signup or login is required. Reviewers can complete onboarding with manual entry or Load Demo Data; bank linking via Plaid is optional and not required for review. Primary flows are onboarding, first audit, dashboard/results, weekly briefing, encrypted backup/export, restore, and subscription purchase or restore. Core records remain stored locally on device. Network calls are limited to optional AI, Plaid, and provider features.

## Recommended App Privacy disclosure posture

- Data collected: yes
- Tracking: no
- Likely data types: financial info, location, identifiers, purchase history, usage data, diagnostics, and user content entered into AI or audit flows
- Likely purposes: app functionality, analytics, and product personalization
- Linked to user: yes where tied to device, actor, Plaid, RevenueCat, or backend identifiers
- Third-party advertising: no

## Recommended App Store copy

### Subtitle

Weekly cash flow clarity

### Promotional Text

Stay ahead of bills, renewals, and cash crunches with a fast weekly money audit that ends with a clear next move.

### Keywords

budget,bills,subscriptions,cash flow,expense tracker,spending,debt,paycheck,savings,planner

### Description

Catalyst Cash helps you get ahead of your money week before bills, renewals, and timing gaps turn into stress.

Run a fast weekly audit, see what needs attention now, and leave with a clear plan for what to do next.

Use Catalyst Cash to:

- review bills, renewals, debt, savings, and cash flow in one place
- spot shortfalls and timing pressure before they become emergencies
- run a guided weekly audit in minutes
- track manually or connect accounts when you want more automation
- keep a local-first financial record on your device
- back up, export, and restore with confidence
- use AskAI for finance-focused follow-up on your current situation

Catalyst Cash is built for real weekly decision-making, not passive dashboard watching. Open the app, understand the week, and move forward with a sharper money plan.
