# Catalyst Cash — Master Developer Manual

> **v1.6.0** · React 18 + Vite 6 + Capacitor 7 · iOS-native personal finance app with AI-powered weekly audits

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Map](#architecture-map)
3. [Setup Guide](#setup-guide)
4. [Project Structure](#project-structure)
5. [Key Modules](#key-modules)
6. [Data Flow: Audit Pipeline](#data-flow-audit-pipeline)
7. [AI Provider System](#ai-provider-system)
8. [Context API Reference](#context-api-reference)
9. [Storage Layer](#storage-layer)
10. [Backend / Cloudflare Worker](#backend--cloudflare-worker)
11. [Build & Deployment](#build--deployment)
12. [Testing](#testing)
13. [Environment Variables](#environment-variables)

---

## Overview

Catalyst Cash is a **privacy-first iOS personal finance app** built with React 18, Vite, and Capacitor. Users input their weekly financial snapshot (checking balance, debts, savings) and the app runs it through a **native math engine** and then an **AI large-language model** to produce a structured weekly financial audit — health score, debt strategy, spending radar, and actionable weekly moves.

**Core value props:**
- All data stored **on-device** via Capacitor Preferences (never on our servers)
- AI audit via backend proxy (no user API key required) **or** BYOK (Gemini / GPT / Claude)
- Mathematically optimal debt payoff (Avalanche + CFI override) computed natively before LLM
- PII scrubbed from all AI prompts using entity anonymization

---

## Architecture Map

### How the Financial Engine Talks to the UI Layer

```
┌─────────────────────────────────────────────────────────────────────┐
│                         App.jsx (Root)                               │
│                                                                       │
│  Context Provider Nesting Order (outside → inside):                  │
│                                                                       │
│  ToastProvider                                                        │
│  └── SettingsProvider          ← financialConfig, API keys, theme    │
│      └── SecurityProvider      ← passcode, Face ID, lock state       │
│          └── PortfolioProvider ← cards, bank accounts, renewals      │
│              └── NavigationProvider ← tab routing, swipe state       │
│                  └── AuditProvider  ← audit pipeline, AI calls       │
│                      └── <CatalystCash />  (renders UI)             │
└─────────────────────────────────────────────────────────────────────┘
```

### Audit Data Flow

```
User fills InputForm
        │
        ▼
AuditContext.handleSubmit()
        │
        ├─ 1. engine.js: generateStrategy()
        │       Computes: floors, paydays, cash flow, debt override
        │       Output: computedStrategy (native math, no LLM)
        │
        ├─ 2. scrubber.js: buildScrubber()
        │       Anonymizes: card names, institutions, income sources
        │       "Chase Sapphire" → "Credit Card 1"
        │
        ├─ 3. prompts.js: getSystemPrompt()
        │       Builds: ~85KB system prompt with user's financial profile
        │       Injects: computedStrategy + persona + personal rules
        │
        ├─ 4. api.js: streamAudit() / callAudit()
        │       Routes to: backend proxy OR BYOK (Gemini/GPT/Claude)
        │       Returns: SSE text stream
        │
        ├─ 5. scrubber.unscrub() — restores real names in real time
        │
        ├─ 6. utils.js: parseAudit() — validates JSON structure
        │
        └─ 7. AuditContext saves to db, triggers badge evaluation,
               updates iOS widget, fires confetti on score ≥ 95
```

### Native Engine → UI

```
engine.js (generateStrategy)
        │
        ├── computedStrategy (injected into system prompt)
        │       - debtOverride: which card to target first
        │       - floor: minimum checking balance
        │       - nextPayday: next paycheck date
        │       - weeklyCapacity: available surplus
        │
        └──> AuditContext injects into LLM → ResultsView renders output
                 │
                 ├── DashboardTab — health score ring, net worth trend
                 ├── ResultsView  — structured audit sections
                 └── DebtSimulator — Avalanche vs Snowball side-by-side
```

---

## Setup Guide

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | `brew install node` |
| npm | ≥ 10 | Bundled with Node |
| Xcode | ≥ 15 | Mac App Store |
| CocoaPods | latest | `sudo gem install cocoapods` |
| Git | any | `brew install git` |

### 1. Clone and Install

```bash
cd ~/Desktop
git clone <repo-url> "PortfolioPro Public"
cd "PortfolioPro Public"
npm install
```

### 2. Web Dev Server (fastest iteration loop)

```bash
npm run dev
# → http://localhost:5173
# → http://<your-local-ip>:5173  (for testing on iPhone over WiFi)
```

The Vite server has `host: true` enabled — your iPhone on the same WiFi network can hit your local IP directly for rapid UI testing without a native build.

### 3. Run the iOS Simulator

```bash
# Full sync + open Xcode (recommended for first run)
npm run ios

# What this does under the hood:
# 1. npm run build      → Vite builds dist/
# 2. npx cap copy ios   → copies dist/ into ios/App/App/public/
# 3. cd ios/App && pod install  → installs CocoaPods dependencies
# 4. node scripts/inject-local-plugins.cjs  → injects local Capacitor plugins
# 5. npx cap open ios   → opens Xcode
```

Once Xcode opens, select a simulator (or your device) and press **▶ Run**.

### 4. Iterating Without Xcode

After the first `npm run ios`, for CSS/JS-only changes you only need:

```bash
npm run sync
# Then in Xcode: Product → Run  (⌘R)
```

Or for web-only changes you don't need to touch Xcode at all — just use the browser at `localhost:5173`.

### 5. Backend Server (Optional — only needed for Plaid or custom worker)

```bash
cd server
npm install
npm start
# → http://localhost:3000
```

The production backend is at `https://api.catalystcash.app` (Cloudflare Worker). The frontend defaults to this — you only need the local server if you're modifying Plaid routes or the audit proxy.

### 6. Environment Variables

Create a `.env` file in the project root (never commit this):

```env
# Only needed for BYOK developer mode — not required for backend mode
VITE_DEFAULT_GEMINI_KEY=your-gemini-key-here
```

All AI keys in production are user-supplied at runtime and stored on-device via `@capacitor/preferences`. They are **never** sent to our servers.

---

## Project Structure

```
PortfolioPro Public/
├── index.html                    # Entry point — Vite SPA shell
├── vite.config.js                # Build config: code splitting, Capacitor patches
├── capacitor.config.json         # Capacitor: appId, iOS settings, plugins
├── package.json                  # Dependencies & npm scripts
│
├── src/
│   ├── main.jsx                  # React root — mounts <AppRoot />
│   ├── App.jsx                   # Root component: context tree, tab router, swipe nav
│   │
│   └── modules/                  # All business logic
│       │
│       ├── ── CORE ENGINE ────────────────────────────────────
│       ├── engine.js             # Native math engine (floors, paydays, debt override)
│       ├── engine.test.js        # Vitest tests for engine
│       ├── prompts.js            # AI system prompt builder (~85KB, 1263 lines)
│       ├── chatPrompts.js        # Chat-specific system prompts
│       ├── api.js                # Multi-provider AI API (Gemini/GPT/Claude/Backend)
│       ├── scrubber.js           # PII anonymizer for AI prompts
│       │
│       ├── ── DATA & STORAGE ─────────────────────────────────
│       ├── utils.js              # db (Capacitor Preferences wrapper), parseAudit, helpers
│       ├── constants.js          # Design tokens (T), app-wide constants, APP_VERSION
│       ├── logger.js             # Structured logger with REDACTED_KEYS (PII-safe)
│       ├── securityKeys.js       # Keys that must never be synced/exported
│       ├── cards.js              # Card ID normalization helpers
│       ├── badges.js             # Achievement badge definitions & evaluation
│       │
│       ├── ── EXTERNAL INTEGRATIONS ──────────────────────────
│       ├── plaid.js              # Plaid Link flow: connect, balance sync, auto-match
│       ├── marketData.js         # Stock/ETF market prices + ticker universe
│       ├── revenuecat.js         # RevenueCat SDK wrapper (IAP/subscription)
│       ├── subscription.js       # Pro gating, quota tracking, device ID
│       ├── cloudSync.js          # iCloud backup via Capacitor Filesystem
│       ├── widgetBridge.js       # iOS Home Screen widget data bridge
│       ├── notifications.js      # Local notifications (payday, bill reminders)
│       ├── haptics.js            # Capacitor Haptics wrapper
│       ├── spreadsheet.js        # Excel/CSV export (ExcelJS + XLSX)
│       ├── csvParser.js          # CSV statement import parser
│       ├── crypto.js             # AES-GCM encryption for backup exports
│       │
│       ├── ── STATIC CATALOGS ────────────────────────────────
│       ├── issuerCards.js        # 400+ credit card catalog by issuer
│       ├── bankCatalog.js        # Bank institution catalog
│       ├── merchantMap.js        # Merchant → category mapping for CSV import
│       ├── providers.js          # Supported AI providers & model registry
│       │
│       ├── ── UI PRIMITIVES ──────────────────────────────────
│       ├── ui.jsx                # Shared components: Card, GlobalStyles, ErrorBoundary
│       ├── components.jsx        # StreamingView, shared form elements
│       ├── Toast.jsx             # Toast notification system
│       ├── LockScreen.jsx        # Passcode / Face ID lock screen
│       ├── SearchableSelect.jsx  # Reusable searchable dropdown
│       │
│       ├── contexts/             # React Context providers (app-wide state)
│       │   ├── SettingsContext.jsx    # financialConfig (50+ fields), API keys, theme
│       │   ├── SecurityContext.jsx    # Auth, passcode, Face ID, privacy mode
│       │   ├── PortfolioContext.jsx   # Cards, bank accounts, renewals, market prices
│       │   ├── NavigationContext.jsx  # Tab routing, swipe animation, onboarding state
│       │   └── AuditContext.jsx       # Full audit pipeline, history, streaming state
│       │
│       └── tabs/                 # Full-screen tab components (16 files)
│           ├── DashboardTab.jsx       # Home: health score, net worth, moves
│           ├── InputForm.jsx          # Weekly financial snapshot form
│           ├── ResultsView.jsx        # Structured audit output renderer
│           ├── AIChatTab.jsx          # Conversational AI chat (with PII scrubbing)
│           ├── HistoryTab.jsx         # Past audits list & detail view
│           ├── CardPortfolioTab.jsx   # Credit cards, bank accounts, Plaid sync
│           ├── RenewalsTab.jsx        # Subscriptions, bills, recurring expenses
│           ├── SettingsTab.jsx        # Configuration: AI, financial params, security
│           ├── DebtSimulator.jsx      # Avalanche vs Snowball debt payoff simulator
│           ├── ProPaywall.jsx         # Pro upgrade screen (RevenueCat)
│           ├── GuideModal.jsx         # In-app help guide
│           └── SetupWizard.jsx        # First-run onboarding wizard
│
├── server/                       # Cloudflare Worker backend
│   ├── index.js                  # Worker entry: /audit proxy + rate limiting
│   ├── plaid-routes.js           # Plaid API endpoints (link-token, exchange, balances)
│   ├── cards.json                # Serverless card data endpoint
│   └── package.json
│
├── ios/                          # Capacitor iOS project (Xcode)
│   └── App/
│       ├── App/
│       │   └── public/           # Built web app (dist/ copied here by `cap copy`)
│       └── Podfile               # CocoaPods dependencies
│
├── scripts/
│   └── inject-local-plugins.cjs  # Injects local Capacitor plugin paths into Xcode project
│
└── public/
    ├── icon-512.png              # App icon
    ├── manifest.json             # PWA manifest
    └── ...
```

---

## Key Modules

### `engine.js` — Native Strategy Engine

The engine runs **before** the AI call to compute mathematically deterministic values. This prevents LLM hallucination on critical financial numbers.

```javascript
// Called in AuditContext before every AI request
const computedStrategy = generateStrategy(financialConfig, {
  checkingBalance, savingsTotal, cards, renewals, snapshotDate
});
```

**Outputs:**
| Field | Description |
|-------|-------------|
| `debtOverride` | Which debt to kill first (3-tier: promo → CFI drag → highest APR) |
| `floor` | Minimum checking balance to maintain |
| `weeklyCapacity` | Spendable surplus after floors and minimums |
| `nextPayday` | Next paycheck date, accounting for bi-weekly / semi-monthly schedules |
| `promoSprint` | Boolean — if any promo APR expires within 90 days |

**Debt Targeting Hierarchy:**
1. **Promo Expiration** — card with promo APR expiring in ≤ 90 days
2. **CFI Drag** — card where `Balance / MinPayment < 50` (cash flow drag)
3. **Highest APR** — standard Avalanche method

### `prompts.js` — System Prompt Builder

A ~98KB JavaScript module that builds a fully personalized, context-aware system prompt for the LLM. It computes inline values using the user's `financialConfig` and injects the output of `engine.js`.

Three persona variants are supported: `command` (analytical), `budget` (encouraging), `nerd` (technical), plus a custom neutral default. Selected via `SettingsContext.persona`.

### `api.js` — AI Provider Router

Handles both streaming (SSE) and non-streaming modes for all four providers:

| Provider | Mode | Notes |
|----------|------|-------|
| `backend` | Default | Routes through `https://api.catalystcash.app` Worker proxy |
| `gemini` | BYOK | Direct to `generativelanguage.googleapis.com` |
| `openai` | BYOK | Direct to `api.openai.com` |
| `claude` | BYOK | Direct to `api.anthropic.com` |

### `scrubber.js` — PII Anonymizer

Before any data reaches the LLM, `buildScrubber()` creates a bidirectional map:

```
"Chase Sapphire Preferred" ↔ "Credit Card 1"
"Ally High Yield Savings"  ↔ "Bank 1"
```

The prompt is scrubbed, AI streams back anonymized text, `unscrub()` restores real names on the fly during streaming so the user sees their real card names in real time.

### `utils.js` — Storage & Parsing

The `db` object is a thin async wrapper over `@capacitor/preferences`:

```javascript
await db.set("card-portfolio", cards);
const cards = await db.get("card-portfolio");
await db.del("current-audit");
await db.clear(); // factory reset
```

`parseAudit(rawText)` validates and extracts the structured JSON that the LLM returns, normalizing both legacy and current response schemas.

---

## Data Flow: Audit Pipeline

```
InputForm.onSubmit(formData)
    → AuditContext.handleSubmit(msg, formData)
        1. Validate: API key present? AI consent given? Online?
        2. generateStrategy() → computedStrategy  [engine.js]
        3. buildScrubber()                         [scrubber.js]
        4. getSystemPrompt(...)                    [prompts.js]
        5. scrubber.scrub(systemPrompt)
        6. streamAudit() or callAudit()            [api.js]
            → SSE chunks arrive
            → setStreamText(scrubber.unscrub(chunk))  (live preview)
        7. scrubber.unscrub(finalRaw)
        8. parseAudit(raw) → structured object
        9. Save audit to db + update trendContext
       10. applyContributionAutoUpdate() → update 401k/Roth YTD
       11. evaluateBadges() → unlock achievement badges
       12. updateWidgetData() → push to iOS Home Screen widget
       13. navTo("results") + haptic.success()
```

---

## AI Provider System

Providers are registered in `providers.js`. Each entry specifies:

```javascript
{
  id: "gemini",
  name: "Google Gemini",
  isBackend: false,        // true = routes through our Worker
  supportsStreaming: true,
  keyStorageKey: "api-key-gemini",  // null for backend mode
  models: [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro" }
  ]
}
```

The `backend` provider requires no API key — it uses our Cloudflare Worker as a proxy with per-device rate limiting (`X-Device-ID` header).

---

## Context API Reference

| Context | Hook | Key State |
|---------|------|-----------|
| `SettingsContext` | `useSettings()` | `financialConfig`, `apiKey`, `aiProvider`, `aiModel`, `persona`, `themeMode` |
| `SecurityContext` | `useSecurity()` | `isLocked`, `requireAuth`, `privacyMode`, `useFaceId`, `lockTimeout` |
| `PortfolioContext` | `usePortfolio()` | `cards`, `bankAccounts`, `renewals`, `marketPrices`, `cardCatalog`, `badges` |
| `NavigationContext` | `useNavigation()` | `tab`, `navTo(id)`, `swipeToTab()`, `onboardingComplete` |
| `AuditContext` | `useAudit()` | `current`, `history`, `loading`, `streamText`, `handleSubmit()`, `clearAll()` |

### `financialConfig` — Key Fields

The `SettingsContext` manages a 50+ field financial profile via a `useReducer`:

```javascript
setFinancialConfig({ payday: "Friday" });                    // object merge
setFinancialConfig(prev => ({ ...prev, payday: "Monday" })); // functional updater
setFinancialConfig({ type: "RESET_YTD" });                   // direct dispatch
```

Key fields:
- `payday`, `payFrequency` — for engine.js pacing
- `emergencyFloor`, `checkingBuffer` — for floor calculation
- `defaultAPR`, `arbitrageTargetAPR` — for invest-vs-debt decision
- `k401EmployerMatchPct`, `k401EmployerMatchLimit` — triggers mandatory match rule
- `budgetCategories`, `savingsGoals`, `nonCardDebts`, `incomeSources` — structured arrays

---

## Storage Layer

All data is stored on-device using `@capacitor/preferences` under the group `CatalystCashStorage`.

| Storage Key | Type | Contents |
|-------------|------|---------|
| `financial-config` | Object | All 50+ `financialConfig` fields |
| `card-portfolio` | Array | Credit card objects |
| `bank-accounts` | Array | Bank account objects |
| `renewals` | Array | Subscriptions & recurring bills |
| `current-audit` | Object | Most recent parsed audit |
| `audit-history` | Array | Up to 52 past audits |
| `move-states` | Object | Checkboxes for weekly moves |
| `trend-context` | Array | Last 8 weeks of financial metrics (injected into AI context) |
| `ai-provider` | String | Selected AI provider ID |
| `ai-model` | String | Selected model ID |
| `ai-consent-accepted` | Boolean | GDPR-style consent flag |
| `api-key-{provider}` | String | BYOK API key per provider |
| `theme-mode` | String | `"dark"` \| `"light"` \| `"system"` |
| `require-auth` | Boolean | Passcode/Face ID enabled |
| `app-passcode` | String | Hashed PIN |
| `plaid-connections` | Array | Plaid access tokens + account metadata |

**Keys that are NEVER exported or synced** (defined in `securityKeys.js`): `app-passcode`, `require-auth`, `use-face-id`, `apple-linked-id`, `plaid-connections`.

---

## Backend / Cloudflare Worker

Located in `server/`. Exposes these endpoints at `https://api.catalystcash.app`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/audit` | POST | Proxy AI calls with rate limiting (X-Device-ID) |
| `/plaid/link-token` | POST | Create Plaid Link token |
| `/plaid/exchange` | POST | Exchange public_token → access_token |
| `/plaid/balances` | POST | Fetch account balances |
| `/plaid/disconnect` | POST | Revoke access token |
| `/cards` | GET | Serve `cards.json` card catalog |

**Rate limiting:** per device, tracked by `X-Device-ID` header. Returns `429` with `Retry-After` on limit breach.

---

## Build & Deployment

### Web Build Only
```bash
npm run build
# Output: dist/
```

### iOS App (Full Pipeline)
```bash
npm run ios
# = npm run build → cap copy ios → pod install → inject-local-plugins → cap open ios
```

### Deploy (Build + Sync, no Xcode open)
```bash
npm run deploy
# = npm run build → npx cap copy
```

### Vite Code Splitting

The build is split into named chunks to avoid a single large bundle:

| Chunk | Contents |
|-------|---------|
| `vendor-react` | React + ReactDOM |
| `vendor-capacitor` | All `@capacitor/*` packages |
| `vendor-charts` | Recharts + D3 dependencies |
| `prompts` | `prompts.js` (~85KB text blob) |
| `card-catalog` | `issuerCards.js` (400+ card catalog) |
| `market-data` | `marketData.js` + ticker universe |

---

## Testing

```bash
npm test
# Runs Vitest in run mode (non-watch)
```

Test files:
- `src/modules/engine.test.js` — Unit tests for the native strategy engine
- `src/modules/subscription.test.js` — Tests for Pro gating logic

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| (none required) | — | App runs fully in backend mode without any env vars |
| `VITE_DEFAULT_GEMINI_KEY` | Dev only | Pre-fills Gemini BYOK key in dev for convenience |

Server-side (Cloudflare Worker secrets — set via Wrangler):
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `GEMINI_API_KEY` (for backend proxy mode)
- `OPENAI_API_KEY` (optional backend fallback)

---

## Development Tips

**Testing on a real iPhone over WiFi:**
```bash
npm run dev
# Open http://<your-mac-IP>:5173 in Safari on your iPhone
```

**Checking Capacitor logs from the iOS simulator:**
```bash
npx cap open ios
# In Xcode: View → Debug Area → Activate Console
```

**Resetting all app data in the browser:**
```javascript
// Paste in the browser console (dev only):
const { Preferences } = await import('@capacitor/preferences');
await Preferences.clear();
window.location.reload();
```

**Adding a new AI provider:**
1. Add entry to `providers.js`
2. Add stream/call functions in `api.js`
3. Wire into `streamAudit()` / `callAudit()` switch statement

**Adding a new tab:**
1. Create `src/modules/tabs/NewTab.jsx`
2. Import in `App.jsx`
3. Add to `navItems` array and render block
4. Add to `SWIPE_TAB_ORDER` in `NavigationContext.jsx` if swipeable
