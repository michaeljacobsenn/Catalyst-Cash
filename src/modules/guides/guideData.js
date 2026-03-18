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
    heroTitle: "Get clear on your money without the overwhelm.",
    heroBody:
      "Use Free to track your accounts, run a weekly audit, and get clear next steps. It is meant to be simple enough for everyday use, not just finance power users.",
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
    heroTitle: "Use the full version once you need more room.",
    heroBody:
      "Pro keeps the same workflow, then adds more usage, better AI depth, full ledger tools, and broader Plaid coverage for heavier real-world use.",
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

export const TAB_GUIDE_CARDS = [
  {
    title: "Dashboard",
    status: "all",
    body:
      "Your snapshot. Check what is safe to spend, what is due soon, and whether your overall money picture is improving.",
  },
  {
    title: "Audit",
    status: "all",
    body:
      "Your main weekly check-in. Run this when you get paid, pay bills, or want a clear action list.",
  },
  {
    title: "AskAI",
    status: "all",
    body:
      "Ask simple follow-up questions like what to pay first, whether you can afford something, or how a decision changes your plan.",
  },
  {
    title: "Portfolio Vault",
    status: "all",
    body:
      "Keep your accounts, debts, investments, and recent activity in one place.",
  },
  {
    title: "Rewards",
    status: "all",
    body:
      "Search a store and see which card is best to use there.",
  },
  {
    title: "Cashflow",
    status: "all",
    body:
      "Track bills, subscriptions, and the next 30 days so fewer expenses catch you off guard.",
  },
  {
    title: "History",
    status: "split",
    body:
      "Look back at older audits to see if things are moving in the right direction. Free shows the latest 12. Pro keeps the full archive.",
  },
  {
    title: "Settings",
    status: "all",
    body:
      "Manage security, Plaid, AI settings, backups, restore, and deletion controls.",
  },
  {
    title: "Transaction Ledger",
    status: "pro",
    body:
      "Pro unlocks the full searchable transaction list, filters, exports, and deeper cleanup tools.",
  },
];

export const WORKFLOW_STEPS = [
  {
    title: "Keep your balances current",
    body:
      "Before you run an audit, make sure your balances and bills are up to date.",
  },
  {
    title: "Run an audit once a week",
    body:
      "That is enough for most people. Run another one after a paycheck, big purchase, or other major change.",
  },
  {
    title: "Start with the top actions",
    body:
      "Do not read everything at once. Start with the main recommendations and the most urgent warnings.",
  },
  {
    title: "Use AskAI when you feel stuck",
    body:
      "Ask one plain-English question at a time, like what to pay first or whether you can safely buy something.",
  },
  {
    title: "Fix mistakes and check again",
    body:
      "If a balance, bill, or transaction is wrong, correct it and rerun. Better inputs lead to better guidance.",
  },
];

export const FINANCE_LOGIC_CARDS = [
  {
    title: "Cash buffer",
    body:
      "Catalyst pays attention to the minimum cash you need to feel safe so you do not accidentally overspend.",
  },
  {
    title: "Debt cost",
    body:
      "High-interest debt gets more attention because it usually costs you the most over time.",
  },
  {
    title: "Credit usage",
    body:
      "The app watches credit card utilization because it can affect both your flexibility and your credit profile.",
  },
  {
    title: "Spending plan",
    body:
      "The budget and cashflow views help you give each dollar a job before it disappears on accident.",
  },
  {
    title: "Bill timing",
    body:
      "Recurring bills matter both by amount and by timing. A smaller bill at the wrong time can still create pressure.",
  },
  {
    title: "Progress over time",
    body:
      "History is there to show whether your choices are actually improving your finances week by week.",
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
    title: "More room, same workflow",
    body:
      "Pro does not make you relearn the app. It mostly removes limits and unlocks the deeper tools.",
  },
  {
    title: "Full ledger and more connected accounts",
    body:
      "The biggest unlocks are the full searchable ledger and support for up to 6 Plaid institutions instead of 1.",
  },
  {
    title: "Stronger AI for harder questions",
    body:
      "Catalyst AI CFO and Boardroom are best for harder tradeoffs, heavier debt situations, and deeper planning questions.",
  },
];

export const PRO_PLAYBOOK = [
  {
    title: "Use CFO most of the time",
    body:
      "CFO should handle most paid audits and chats. Use Boardroom when the decision is unusually messy or high-stakes.",
  },
  {
    title: "Clean your ledger before big decisions",
    body:
      "If your transaction list looks wrong, fix that before a serious audit so the advice starts from better data.",
  },
  {
    title: "Review subscriptions once a month",
    body:
      "Use the renewals screen as a monthly savings check so bills do not slowly pile up unnoticed.",
  },
  {
    title: "Use history to check if changes worked",
    body:
      "Compare current results to older audits to see whether a decision actually improved your cash, debt, or score.",
  },
];

export const COMMON_QUESTIONS = [
  {
    question: "Do I need Plaid to use the app well?",
    answer:
      "No. Plaid is optional. Manual entry still works, but live connections make audits faster and easier to trust.",
  },
  {
    question: "Does Pro change the financial math?",
    answer:
      "No. Pro mostly changes limits, model depth, history depth, and premium tools. The core budgeting, debt, and cashflow logic is available to everyone.",
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
