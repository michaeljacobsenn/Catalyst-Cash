# iOS Launch Checklist

Use this after `npm run verify` passes. The terminal suite does not replace real device validation.

Current repo configuration ships iPhone-only. If you re-enable iPad support later, add a dedicated iPad validation pass before release.

## Device gates

Run these on at least:

- 1 current-gen iPhone on the latest public iOS
- 1 smaller-screen iPhone
- 1 older supported iPhone with a realistic local database

## Manual release checks

1. Cold launch
   - Fresh install, first launch, splash transition, onboarding, and first audit all complete without layout jumps or frozen frames.
2. Warm restore
   - Background the app for 30 seconds, 5 minutes, and after a device lock/unlock.
   - Return to the same tab, same scroll position, and preserved draft state where expected.
3. Offline and degraded network
   - Launch offline.
   - Open dashboard, audit history, portfolio, and chat.
   - Confirm cached data stays readable and network-dependent actions fail with clear copy.
4. Native security
   - App passcode lock, biometric unlock, lock-after-background, and failed unlock handling.
   - Confirm no protected values render before unlock completes.
5. Plaid and linked accounts
   - Fresh link, refresh, partial failure, reconnect-required, and paused/free-tier behavior.
   - Confirm last-known balances remain visible when live sync fails.
6. Export and share flows
   - Encrypted backup export, spreadsheet export, PDF export, and share-sheet cancel path.
   - Confirm cancelled shares do not report success.
7. Import and recovery
   - Restore from encrypted backup and spreadsheet import.
   - Relaunch after restore and confirm financial config, cards, renewals, and transactions rehydrate correctly.
8. Notifications and background triggers
   - Store-arrival suggestions, reminder notifications, and background/foreground resumption.
   - Confirm no duplicate notifications after repeated resumes.
9. Performance profiling
   - Xcode Instruments for memory, main-thread time, and animation hitching on dashboard, audit results, transaction feed, and export flows.
   - Flag any sustained memory growth across repeated audits, exports, or tab switches.
10. Native platform polish
   - Safe-area spacing, keyboard avoidance, copy/paste, file picker, iCloud restore, and share sheet behavior on physical hardware.

## Ship blockers

Do not ship if any of these fail:

- Protected content flashes before unlock.
- Restore/import mutates or drops core finance records.
- Offline launch traps the user in a broken shell.
- Export/share reports success after cancellation or silent failure.
- Plaid failure removes the last trusted cached balances.
- Repeated audits, exports, or navigation produce memory growth or visible hitching on target devices.
