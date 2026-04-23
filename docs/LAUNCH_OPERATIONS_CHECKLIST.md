# Launch Operations Checklist

Use this after the repo gates are green and before opening launch or a public TestFlight wave.

## Current release target

- App: `Catalyst Cash`
- Bundle ID: `com.jacobsen.portfoliopro`
- Version: `2.0.0`
- Build: `49`

## Production backend

- Confirm `https://api.catalystcash.app/health` returns `status: ok`
- Confirm `https://api.catalystcash.app/config` returns:
  - `gatingMode: "live"`
  - `minVersion: "2.0.0"` or higher only if intentionally forcing an app update
  - `entitlementVerification: true`
- Confirm Cloudflare worker secrets/vars are present:
  - `REVENUECAT_SECRET_KEY`
  - `REVENUECAT_ENTITLEMENT_ID` if it differs from the default `Catalyst Cash Pro`
  - `GOOGLE_API_KEY` or `GEMINI_API_KEY`
  - `PLAID_CLIENT_ID`
  - `PLAID_SECRET`

## App Store Connect and RevenueCat

- Latest TestFlight build matches this repo launch candidate
- The build is available to the intended tester group
- Corrected App Store screenshots are uploaded for the 6.5-inch iPhone slot
- App Store privacy declarations match the live privacy policy before review submission
- Content Rights and Digital Services Act setup are completed before review submission when required
- In-App Purchases are approved and attached to the app/version:
  - `com.catalystcash.pro.monthly.v2`
  - `com.catalystcash.pro.yearly.v2`
  - `com.catalystcash.pro.lifetime.v2`
- RevenueCat active offering maps to the same product IDs
- RevenueCat entitlement ID matches `Catalyst Cash Pro`
- Restore purchases works in TestFlight

## Gemini and vendor billing

- Google billing is active for the production project
- Gemini quota is high enough for beta/launch traffic
- Budget alerts and hard-spend alerts are configured
- Error monitoring is in place for provider failures and 429s

## Physical-device gate

- Run the full manual checklist in [IOS_LAUNCH_CHECKLIST.md](/Users/michaeljacobsen/Desktop/PortfolioPro Public/docs/IOS_LAUNCH_CHECKLIST.md)
- Do not ship if any ship blocker in that checklist fails

## Public testing posture

- Public TestFlight keeps build `49` live for the public testing wave
- Marketing/site CTA points to the live public TestFlight link
- Privacy policy at `https://catalystcash.app/privacy` reflects optional AI, Plaid, rewards location, purchase, and telemetry behavior
- Feedback email is `support@catalystcash.app`
- Testers know where to send bugs, screenshots, and reproduction steps
