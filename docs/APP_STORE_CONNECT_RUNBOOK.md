# App Store Connect Runbook

Use this after the repo gates are green and the backend/site changes are already live.

## Current state as of April 24, 2026

- Production config is live with `gatingMode: "live"` at `https://api.catalystcash.app/config`
- Production health must advertise OpenAI as the default provider at `https://api.catalystcash.app/health`
- Repo gates passed on this machine: `lint`, `typecheck`, `prompts:check`, targeted unit tests, production `build`, and `test:e2e:critical`
- Latest deployed Worker version from this machine: `6dcb6b98-a6ed-41b2-b3c8-3d3d718e562d`
- Latest deployed Pages preview from this machine: `https://7ec87f0d.catalystcash.pages.dev`
- Latest signed App Store Connect upload previously sent from this machine: build `51`
- App: `Catalyst Cash`
- Bundle ID: `com.jacobsen.portfoliopro`
- Version: `2.0.0`
- App Store Connect `iOS App Version 2.0.0` page still showed build `49` attached after the April 24 metadata sweep
- Public TestFlight group previously pointed only to build `49`
- Build `49` is approved for external testing and live on the public TestFlight link
- Corrected iPhone 6.5-inch App Store screenshots are uploaded with the current app icon
- App Store promotional text, description, and keywords were saved on April 24, 2026
- Privacy policy is live at `https://catalystcash.app/privacy`
- Support / beta feedback email: `support@catalystcash.app`

## Minimal manual actions left

### 1. Complete App Store Connect declarations and submit

1. Save Content Rights once the final legal representation is confirmed.
2. Update App Privacy from `Data Not Collected` to match the live privacy policy and production telemetry behavior.
3. Complete Digital Services Act setup if Apple requires trader/contact information for the account.
4. Attach the latest processed build before App Review. The page still showed build `49` attached during the April 24 sweep.
5. Click `Add for Review` only after the declarations are complete.

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

### 5. Confirm AI vendor billing

In OpenAI / the production AI vendor account, verify:

- billing is active for the production OpenAI project
- monthly budget alerts and hard-spend alerts are enabled
- usage limits are sufficient for public TestFlight traffic
- worker secrets point to the active production OpenAI key

### 6. Run physical-device smoke

Run the checks in [IOS_LAUNCH_CHECKLIST.md](/Users/michaeljacobsen/Desktop/PortfolioPro%20Public/docs/IOS_LAUNCH_CHECKLIST.md) before final App Review, including a same-iCloud-account encrypted backup restore on a real iPhone.

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

Know what is safe to spend, which bills are coming, and what move to make next with a private weekly money audit and finance-focused Ask AI.

### Keywords

budget,bills,cash flow,expense tracker,spending,debt,paycheck,savings,subscriptions,credit cards

### Description

Catalyst Cash is a weekly command center for personal cash flow, bills, subscriptions, credit cards, and money decisions.

Instead of staring at a generic budget dashboard, run a fast money audit and leave with a clear answer: what is safe to spend, what bills are coming, which card makes sense, and what move matters most this week.

Use Catalyst Cash to:

- See your safe-to-spend number before bills and renewals hit
- Catch upcoming subscriptions, annual fees, and timing gaps early
- Review checking, savings, debt, cards, rewards, and cash flow in one place
- Choose the right card before you pay
- Build a weekly action plan for debt payoff, savings, and spending control
- Ask finance-focused AI follow-up questions grounded in your current snapshot
- Track manually or connect accounts when you want more automation
- Keep a local-first financial record on your device
- Back up, export, and restore your data with confidence

Catalyst Cash is built for people who want an active money system, not passive charts. Open the app, run the audit, understand the week, and move forward with a sharper plan.

Privacy-first by design: your core records stay local on your device. Optional online features are used only when you choose them, such as AI, account linking, backup, restore, or export workflows.
