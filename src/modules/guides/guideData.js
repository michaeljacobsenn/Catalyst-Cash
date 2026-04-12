import {
  FREE_AUDIT_LIMIT,
  FREE_CHAT_LIMIT,
  IAP_PRICING,
  INSTITUTION_LIMITS,
  PLAN_DISPLAY,
  PRO_DAILY_CHAT_CAP,
  PRO_MONTHLY_AUDIT_CAP,
} from "../planCatalog.js";

export const PLAN_FACTS = {
  free: {
    id: "free",
    label: "Free Plan",
    badge: "Included",
    heroTitle: "Build a clean weekly money rhythm.",
    heroBody:
      "Free gives you the core Catalyst loop: keep your key accounts honest, run a sharp weekly audit, and leave with a short list of next moves.",
    audits: PLAN_DISPLAY.free.audits,
    chats: PLAN_DISPLAY.free.chats,
    models: PLAN_DISPLAY.free.models,
    plaid: PLAN_DISPLAY.free.plaid,
    history: PLAN_DISPLAY.free.history,
  },
  pro: {
    id: "pro",
    label: "Pro Plan",
    badge: "Unlocked",
    heroTitle: "Run the full Catalyst operating system.",
    heroBody:
      "Pro is for people who want up to 8 Plaid institutions, quieter balance and ledger upkeep, deeper AI, and the archive needed to see whether decisions are actually working.",
    audits: PLAN_DISPLAY.pro.audits,
    chats: PLAN_DISPLAY.pro.chats,
    models: PLAN_DISPLAY.pro.models,
    plaid: PLAN_DISPLAY.pro.plaid,
    history: PLAN_DISPLAY.pro.history,
  },
};

export const PRICING_FACTS = {
  monthly: `${IAP_PRICING.monthly.price}/mo`,
  yearly: `${IAP_PRICING.yearly.price}/yr`,
  yearlyPerMonth: `${IAP_PRICING.yearly.perMonth}/mo effective`,
  yearlySavings: IAP_PRICING.yearly.savings,
  trial: IAP_PRICING.yearly.trial,
  lifetime: `${IAP_PRICING.lifetime.price} once`,
  lifetimeSavings: IAP_PRICING.lifetime.savings,
};

export const PAYWALL_FEATURES = [
  { label: "AI Audits", free: `${FREE_AUDIT_LIMIT} / week`, pro: `${PRO_MONTHLY_AUDIT_CAP} / month`, icon: "📊" },
  { label: "AskAI Chat", free: `${FREE_CHAT_LIMIT} / day`, pro: `${PRO_DAILY_CHAT_CAP} / day`, icon: "💬" },
  { label: "AI Models", free: "Catalyst AI", pro: "CFO + Boardroom", icon: "🧠" },
  { label: "Audit History", free: "Last 12", pro: "Full archive", icon: "📜" },
  { label: "Dashboard & Charts", free: "Included", pro: "Included", icon: "📈" },
  { label: "Debt / Budget / FIRE", free: "Included", pro: "Included", icon: "⚙️" },
  { label: "Plaid Connections", free: `${INSTITUTION_LIMITS.free} institution`, pro: `${INSTITUTION_LIMITS.pro} institutions`, icon: "🏦" },
  { label: "Transaction Ledger", free: "Vault preview only", pro: "Full search + export", icon: "📒" },
  { label: "Rewards Ranking", free: "Best card winner", pro: "Full runner-up stack", icon: "💳" },
  { label: "Renewals AI Assist", free: "Manual tracking", pro: "Auto-detect + scripts", icon: "🔁" },
  { label: "Cash Flow Heatmap", free: "Timeline only", pro: "Timeline + heatmap", icon: "📅" },
  { label: "Exports & Sharing", free: "Audit export", pro: "Audit + ledger export", icon: "📤" },
  { label: "Security & Backup", free: "Included", pro: "Included", icon: "🛡️" },
];

export const FIRST_ACTION_STEPS = [
  {
    title: "Load the accounts that decide your week",
    body:
      "Start with checking, savings, credit cards, and any loan or bill that can create pressure this month.",
  },
  {
    title: "Add recurring pulls on cash",
    body:
      "Rent, subscriptions, minimum payments, and other known charges make the audit materially smarter.",
  },
  {
    title: "Run one honest audit fast",
    body:
      "Do not wait for perfect setup. Current cash, debt, and due dates are enough to get a useful first action list.",
  },
  {
    title: "Come back after paydays and big moves",
    body:
      "Catalyst works best as a weekly operating rhythm, not a once-a-quarter reporting app.",
  },
];

export const TAB_GUIDE_CARDS = [
  {
    title: "Dashboard",
    status: "all",
    body:
      "Read this first. It tells you whether the week is under control, what is due next, and whether your position improved.",
  },
  {
    title: "Audit",
    status: "all",
    body:
      "This is the decision engine. Run it when you get paid, before large purchases, or anytime you need the clearest next moves.",
  },
  {
    title: "Cashflow",
    status: "all",
    body:
      "Use this to stage bills, subscriptions, and the next 30 days so timing problems show up before they hurt.",
  },
  {
    title: "AskAI",
    status: "all",
    body:
      "Use it after the audit for tradeoffs: what to pay first, whether you can afford something, or how a choice changes runway.",
  },
  {
    title: "Portfolio Vault",
    status: "all",
    body:
      "Your source of truth for banks, cards, loans, assets, and the freshest balances Catalyst has on hand.",
  },
  {
    title: "Rewards",
    status: "all",
    body:
      "Use it at the point of purchase to pick the right card instead of guessing.",
  },
  {
    title: "History",
    status: "split",
    body:
      "This is where you verify progress. Free keeps the latest 12 audits. Pro keeps the full archive so you can see whether changes actually worked.",
  },
  {
    title: "Transaction Ledger",
    status: "pro",
    body:
      "Pro turns raw transactions into a usable tool: search, filter, export, and clean up the details behind the audit.",
  },
  {
    title: "Settings",
    status: "all",
    body:
      "Control security, backup, restore, Plaid, AI behavior, and the deletion tools that keep you in charge.",
  },
];

export const WORKFLOW_STEPS = [
  {
    title: "Refresh only the numbers that changed reality",
    body:
      "Update the balances, due dates, and renewals that could change this week's decisions.",
  },
  {
    title: "Read the top three moves first",
    body:
      "Start with the strongest actions, urgent warnings, and safe-to-spend read before opening every card.",
  },
  {
    title: "Open the tool that resolves the bottleneck",
    body:
      "Use AskAI for tradeoffs, Cashflow for timing, Renewals for recurring waste, and Ledger for cleanup.",
  },
  {
    title: "Record the truth after you act",
    body:
      "If you paid a card, canceled a bill, or corrected a balance, reflect that so the next audit starts cleaner.",
  },
  {
    title: "Use history to validate, not admire",
    body:
      "Look back to confirm that your choices improved cash safety, debt pressure, or trend direction.",
  },
];

export const FINANCE_LOGIC_CARDS = [
  {
    title: "Cash buffer",
    body:
      "Catalyst watches the floor beneath your checking balance so you do not mistake temporary cash for safe cash.",
  },
  {
    title: "Debt drag",
    body:
      "High-interest balances get priority because they quietly tax every month you keep them alive.",
  },
  {
    title: "Utilization pressure",
    body:
      "Card usage matters because it changes both flexibility and credit profile, even before interest is due.",
  },
  {
    title: "Timing pressure",
    body:
      "A smaller bill at the wrong time can still create a bad week. Timing matters as much as totals.",
  },
  {
    title: "Recurring waste",
    body:
      "Subscriptions and repeat charges are treated like ongoing claims on future cash, not harmless background noise.",
  },
  {
    title: "Trend validation",
    body:
      "History exists to prove whether your decisions are making the system safer, cleaner, and easier to run.",
  },
];

export const PRIVACY_CARDS = [
  {
    title: "Your data lives on your device first",
    status: "all",
    body:
      "Balances, renewals, and most settings are stored locally first instead of treating the server like the main home for your data.",
  },
  {
    title: "AI requests go through a scrubbed proxy",
    status: "all",
    body:
      "AI requests are routed through the Catalyst backend with sensitive details scrubbed before they are sent onward.",
  },
  {
    title: "Chat does not live forever",
    status: "all",
    body:
      "Saved AskAI chats are encrypted at rest and expire after 24 hours. Privacy Mode can avoid saving them at all.",
  },
  {
    title: "Plaid tokens stay off-device",
    status: "all",
    body:
      "The app does not keep Plaid access tokens on your phone. It keeps only local connection metadata and account state.",
  },
  {
    title: "Backup and restore",
    status: "split",
    body:
      "Encrypted export and restore are built in. iCloud and household sync depend on secure native device storage.",
  },
  {
    title: "You stay in control",
    status: "all",
    body:
      "Passcode, Face ID or Touch ID, re-lock timing, history clearing, and full deletion controls all live in Settings.",
  },
];

export const FREE_UPGRADE_CARDS = [
  {
    title: "Broader live coverage",
    body:
      "Pro keeps up to 8 institutions in play and quietly refreshes balances and ledger data so you stop babysitting which account matters today.",
  },
  {
    title: "Full ledger control",
    body:
      "Search, filter, export, and fix transactions when the details matter, instead of living with a partial view.",
  },
  {
    title: "Deeper AI for harder calls",
    body:
      "CFO and Boardroom are built for multi-account tradeoffs, debt strategy, and more consequential decisions.",
  },
];

export const PRO_PLAYBOOK = [
  {
    title: "Treat the audit as your command center",
    body:
      "Run the audit first, then use CFO or Boardroom only on the decision that still needs judgment.",
  },
  {
    title: "Use the ledger before major planning",
    body:
      "A few minutes of cleanup before a serious audit makes the answers materially better.",
  },
  {
    title: "Review renewals monthly, not reactively",
    body:
      "Let recurring charges earn their place. Small leaks become meaningful over a year.",
  },
  {
    title: "Watch the trend, not just the score",
    body:
      "The archive matters because direction is more useful than a single snapshot.",
  },
];

export const COMMON_QUESTIONS = [
  {
    question: "Should I start on Free or go straight to Pro?",
    answer:
      "Start on Free if you want to prove the workflow first. Go straight to Pro if you already know you need multiple institutions, the full ledger, deeper AI, or a complete audit archive.",
  },
  {
    question: "What does Pro change day to day?",
    answer:
      "It removes the main friction points: more audits, more AskAI, up to 8 Plaid institutions, quieter balance and ledger upkeep, full ledger search and export, stronger models, and the archive needed to track progress over time.",
  },
  {
    question: "Do I need Plaid to get value?",
    answer:
      "No. Manual entry works. Plaid mainly saves time and keeps balances and ledger data fresher in the background, which matters more as your account set grows.",
  },
  {
    question: "Is the output financial advice?",
    answer:
      "No. The app produces educational analysis and decision support. It does not replace a licensed financial, tax, legal, or investment professional.",
  },
];

export const GUIDE_BADGES = {
  all: "All plans",
  pro: "Pro unlock",
  split: "Free + Pro differ",
  native: "Native iPhone",
};

export const COMING_SOON_FEATURES = [
  { label: "Net worth projections", icon: "🔮", desc: "Longer-range planning beyond the current short-term operating view." },
  { label: "Goal tracking", icon: "🏁", desc: "Dedicated milestone tracking for debt freedom, savings targets, and major purchases." },
  { label: "Widgets", icon: "📱", desc: "Faster glanceability for score, cash pressure, and portfolio changes from the Home Screen." },
];
