# Changelog

## [1.2.0] - 2025-02-24 — Intelligence, Gamification & Engagement Update

### New: AI Intelligence Layer
- **Weekly Health Score (A+ to F):** AI now scores your financial health 0–100 across 5 weighted factors (floor safety, debt ratio, savings momentum, obligation coverage, spending discipline). Animated SVG radial gauge on Dashboard with grade letter, trend arrow, and one-sentence summary.
- **Compressed Trend Context:** After each audit, 5 key metrics (checking, vault, debt, score, status) are stored and the last 4 weeks (~150 tokens) are injected into the AI prompt for pattern detection, week-over-week comparisons, and trend awareness.
- **AI Persona Picker:** Choose how your financial advisor communicates — Default (balanced), Strict Coach 🪖 (tough love), Supportive Friend 🤗 (encouraging), or Data Nerd 🤓 (statistical). Settings → Rules → AI Personality.

### New: Analytics & Predictions
- **Progress-Over-Time Chart:** Health score area chart showing up to 12 weeks of score history with green gradient fill and interactive tooltips.
- **Predictive Alerts:** Three smart forward-projection cards — Floor Breach Risk (burn rate → emergency floor timeline), Debt Freedom Projection (paydown rate → debt-free date), and Health Score Trend (above/below average).

### New: Gamification System
- **Achievement Badges:** 15 unlockable badges across 4 tiers (Bronze, Silver, Gold, Platinum). Triggers include: first audit, streaks (4/8/12-week), score milestones (80+/90+), debt destroyer, savings milestones ($1K/$5K), net worth positive, budget boss (4× GREEN), persona set, challenges completed.
- **Badge Gallery:** 4-column grid on Dashboard with tier-colored glow on unlocked badges, lock icons on locked ones, and progress counter. Toast notifications on new unlocks.
- **Weekly Micro-Challenges:** 12 challenge templates (Easy/Medium/Hard) with point values (25–75 pts). Deterministic weekly rotation via seeded shuffle. Completion tracking, challenge streak, and total points. Unlocks Challenge Accepted and Challenge Master badges.

### New: Financial Tools
- **Debt Payoff Simulator:** Interactive slider ($0–$1,000 extra/month), full compound interest amortization simulation, animated bar chart timeline, side-by-side Avalanche vs Snowball comparison with recommended strategy, and impact summary.
- **Guided First Audit (Demo):** New users can run a demo audit with realistic sample data (YELLOW status, C+ health score, 2 credit cards, 4 weekly moves) to see the full Dashboard experience before entering real numbers.

### New: UI & Experience
- **Smooth Page Transitions:** CSS `tabSlideIn` keyframe (8px slide-up + fade, 280ms cubic-bezier) triggered on every tab switch via `key={renderTab}`.
- **Share My Score:** Canvas-rendered branded score card (400×520px dark gradient) with grade circle, score, status, date, summary, and "Powered by Catalyst Cash" watermark. Shares via native iOS Share API or downloads as PNG on web.

### Fixes & Optimizations
- Fixed badge streak calculation — now computes actual ISO week streak instead of hardcoded 0.
- Fixed `shared_score` badge trigger — now unlocks when Share My Score is tapped.
- Removed unused `useState` import from `DashboardTab.jsx`.
- Replaced redundant dynamic import of `badges.js` with static import.
- Version bumped to 1.2.0 across all 5 reference points.

### Files Changed
- **New:** `src/modules/badges.js`, `src/modules/tabs/DebtSimulator.jsx`, `src/modules/tabs/WeeklyChallenges.jsx`
- **Modified:** `src/App.jsx`, `src/modules/tabs/DashboardTab.jsx`, `src/modules/tabs/SettingsTab.jsx`, `src/modules/prompts.js`, `src/modules/utils.js`, `src/modules/ui.jsx`

---

## [1.1.1] - Elite Financial & UX Optimization Update (V2)

### Financial Logic Improvements
- **Arbitrage Target APR (`arbitrageTargetAPR`)**: The AI Debt Kill loop now smartly evaluates highest-priority debt APR vs a user-defined Arbitrage Target (default 6.00%). If the debt is cheaper than the target, surplus cash is legally redirected to investments (Brokerage/Roth) to optimize net worth mathematically over the long term.
- **Credit Score Rescue Protocol**: Overhauled the strict Insolvency Protocol (Checking Floor protection). The rules engine is now authorized to tap the Emergency Reserve unconditionally to save an at-risk *Minimum Payment* on a credit card. (Safeguarding a 750+ FICO score is now strictly valued higher than hoarding the cash floor).

### UI & UX (Native iOS Emulation)
- **Glassmorphism Shell Engine**: The Top header bar and Bottom Nav bar in `App.jsx`, along with the `SettingsTab.jsx` sticky header, have been upgraded with heavy native iOS frosted glass physics (`backdrop-filter: blur(24px) saturate(1.8)`) for a premium modern aesthetic.
- **Strict Data Pad Compliance**: Applied `inputMode="decimal"` and `type="number"` strictly across *all* financial inputs to suppress the alphabetical iOS keyboard in favor of the clean native numpad.
- **Empty State Hints**: Upgraded array states in the Settings panel with clean, subtle helper text when lists (like Debts, Goals, Insurances) are empty, avoiding the "broken UI" feel.

### Core Architecture & Prompt Engineering
- **XML Tag Enforcement**: Injected `<LIVE_APP_DATA>` and `<RULES>` XML boundaries into the core AI execution prompt. This anchors LLMs (especially Claude 3.5 Sonnet and ChatGPT) preventing deep hallucinogenic drift during sequence execution.
- **Defensive Type Safety**: Added numeric fallbacks `|| 0` across string interpolation injection points to prevent `NaN` or `undefined` poisoning the prompt context window.
- **Data Model Migration**: Successfully injected all 13 new state properties directly into exported JSON configurations.

### AI Prompt & Intelligence Architecture
- **Cash Flow Index (CFI) Elite Math**: Modified Debt Kill loop to prioritize the abolition of massive "cash drag" debts, destroying inefficient minimum payments before defaulting to Avalanche APR sorting.
- **Provider Personas**: Splintered the core AI identity into 3 bespoke frameworks leveraging each model's native strengths:
    - 🚀 **OpenAI GPT-4o**: Quantitative Financial Analyst & Liquidity Engine
    - 🧠 **Gemini 1.5/2.0**: Elite Behavioral Economist (Habit Leakage)
    - 🩺 **Claude 3.5 Sonnet**: Master Holistic Wealth Architect & CFO
- **OpenAI Model Expansion**: Defaulted OpenAI routing to `gpt-4o` and introduced native dynamic token-limiting logic (`max_completion_tokens`) to properly support the `o1` and `o3-mini` reasoning series.

### UI & UX Polish
- **Elite Audit Spinner**: Completely rewrote the `StreamingView` loading bridge to include a timed progress bar with dynamic glow, contextual rotating string messages, and explicit `STREAMING AUDIT PAYLOAD` trigger snapping.
- **Results Engine Badging**: Overhauled the raw text view of alternative execution modes (e.g., `DATA SETTLEMENT`) with distinct Amber warning badges.
- **Markdown Renderer Upgrade**: Corrected a flaw causing `**DASHBOARD CARD**` and other headers to duplicate by discarding them entirely during extraction in `utils.js`. Stripped literal asterisks (`**`) from table cells natively in the UI components for pristine rendering.

### Security
- **Repository Lockdown**: Fulfilling a privacy mandate, the `michaeljacobsenn/Portfolio-Pro-Public` repository was migrated to PRIVATE status via the GitHub CLI.
