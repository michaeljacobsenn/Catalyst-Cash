#!/usr/bin/env node

const TARGET_URL = process.env.CHAT_EVAL_TARGET_URL || "https://catalystcash-api.portfoliopro-app.workers.dev";
const DEVICE_ID = process.env.CHAT_EVAL_DEVICE_ID || `chat-quality-${Date.now()}`;
const APP_VERSION = process.env.CHAT_EVAL_APP_VERSION || "2.0.0-quality";
const PASS_SCORE = Number(process.env.CHAT_EVAL_PASS_SCORE || 85);
const HIGH_QUALITY_SCORE = Number(process.env.CHAT_EVAL_HIGH_QUALITY_SCORE || 90);
const TIMEOUT_MS = Number(process.env.CHAT_EVAL_TIMEOUT_MS || 60_000);

const MODELS = [
  { id: "gpt-5-nano", label: "Nano" },
  { id: "gpt-5-mini", label: "CFO" },
  { id: "gpt-5.1", label: "Boardroom" },
];

function todayPlus(days) {
  const date = new Date("2026-04-24T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dollars(value) {
  return `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const SCENARIOS = [
  {
    id: "paycheck-tight-renter",
    question: "Where did my money go last week?",
    expectedTerms: ["Spotify", "gym", "car insurance", "checking", "buffer"],
    expectedNumbers: [425, 1180, 145, 28],
    brief: {
      generatedAt: "2026-04-24T12:00:00Z",
      snapshotDate: "2026-04-24",
      currencyCode: "USD",
      profile: { preferredName: "Jordan", birthYear: 1998, age: 28, payFrequency: "bi-weekly", incomeType: "salary", housingType: "rent", stateCode: "OH" },
      income: { cycleNet: 2420, estimatedMonthly: 5243, sources: [{ name: "Design salary", amount: 2420, frequency: "bi-weekly", type: "salary", nextDate: todayPlus(7) }] },
      snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 63, netWorth: 14850 },
      cash: { checking: 1280, vault: 925, pending: 210, available: 425, emergencyFloor: 1500, checkingBuffer: 350, weeklySpendAllowance: 210 },
      credit: { creditScore: 704, creditUtilization: 31, totalCardDebt: 1960, totalCardLimit: 6400, overallUtilization: 30.6 },
      debt: { totalNonCardDebt: 8900, totalDebt: 10860, nonCardDebts: [{ name: "Auto loan", balance: 8900, apr: 6.7, minPayment: 289 }] },
      cards: [{ id: "freedom", name: "Freedom Flex", institution: "Chase", balance: 1180, limit: 4200, utilization: 28.1, apr: 27.99, minPayment: 42, annualFee: 0, annualFeeDue: null, statementCloseDay: 12, paymentDueDay: 7, last4: "2448", plaidLinked: true }],
      renewals: {
        monthlyEstimate: 173,
        items: [
          { name: "Spotify Family", amount: 19.99, interval: 1, intervalUnit: "months", monthlyAmount: 19.99, nextDue: todayPlus(3), chargedTo: "Freedom Flex", category: "streaming" },
          { name: "Gym", amount: 48, interval: 1, intervalUnit: "months", monthlyAmount: 48, nextDue: todayPlus(5), chargedTo: "Checking", category: "fitness" },
          { name: "Car insurance", amount: 145, interval: 1, intervalUnit: "months", monthlyAmount: 145, nextDue: todayPlus(10), chargedTo: "Checking", category: "insurance" },
        ],
      },
      bankAccounts: [
        { id: "checking", name: "Everyday Checking", bank: "Local CU", accountType: "checking", balance: 1280, apy: 0.01, plaidLinked: true, reconnectRequired: false },
        { id: "vault", name: "Emergency Vault", bank: "Ally", accountType: "savings", balance: 925, apy: 4.1, plaidLinked: true, reconnectRequired: false },
      ],
      nearTerm: {
        totalDue14Days: 212.99,
        byFundingSource: [{ label: "Checking", total: 193, itemCount: 2, nextDue: todayPlus(5) }, { label: "Freedom Flex", total: 19.99, itemCount: 1, nextDue: todayPlus(3) }],
        items: [
          { name: "Spotify Family", amount: 19.99, nextDue: todayPlus(3), chargedTo: "Freedom Flex", chargedToType: "card" },
          { name: "Gym", amount: 48, nextDue: todayPlus(5), chargedTo: "Checking", chargedToType: "checking" },
          { name: "Car insurance", amount: 145, nextDue: todayPlus(10), chargedTo: "Checking", chargedToType: "checking" },
        ],
      },
      trends: [
        { date: "2026-04-03", score: 69, status: "GREEN", checking: 2240, vault: 925, totalDebt: 10240 },
        { date: "2026-04-17", score: 63, status: "YELLOW", checking: 1280, vault: 925, totalDebt: 10860 },
      ],
      auditHistory: [],
    },
  },
  {
    id: "high-income-card-debt",
    question: "Which card should I attack first and how much can I safely pay today?",
    expectedTerms: ["Sapphire", "APR", "utilization", "safe", "checking"],
    expectedNumbers: [2300, 6900, 29, 820],
    brief: {
      generatedAt: "2026-04-24T12:00:00Z",
      snapshotDate: "2026-04-24",
      currencyCode: "USD",
      profile: { preferredName: "Avery", birthYear: 1989, age: 37, payFrequency: "semi-monthly", incomeType: "salary", housingType: "own", stateCode: "TX" },
      income: { cycleNet: 5100, estimatedMonthly: 10200, sources: [{ name: "Engineering salary", amount: 5100, frequency: "semi-monthly", type: "salary", nextDate: todayPlus(6) }] },
      snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 67, netWorth: 184000 },
      cash: { checking: 6900, vault: 18400, pending: 820, available: 2300, emergencyFloor: 5000, checkingBuffer: 1200, weeklySpendAllowance: 600 },
      credit: { creditScore: 681, creditUtilization: 47, totalCardDebt: 14150, totalCardLimit: 30000, overallUtilization: 47.2 },
      debt: { totalNonCardDebt: 315000, totalDebt: 329150, nonCardDebts: [{ name: "Mortgage", balance: 315000, apr: 5.85, minPayment: 2410 }] },
      cards: [
        { id: "sapphire", name: "Sapphire Preferred", institution: "Chase", balance: 7600, limit: 12000, utilization: 63.3, apr: 29.99, minPayment: 196, annualFee: 95, annualFeeDue: "2026-08-01", statementCloseDay: 19, paymentDueDay: 14, last4: "3981", plaidLinked: true },
        { id: "amex", name: "Blue Cash", institution: "Amex", balance: 4100, limit: 10000, utilization: 41, apr: 24.99, minPayment: 122, annualFee: 0, annualFeeDue: null, statementCloseDay: 22, paymentDueDay: 17, last4: "8812", plaidLinked: true },
        { id: "discover", name: "Discover It", institution: "Discover", balance: 2450, limit: 8000, utilization: 30.6, apr: 21.99, minPayment: 74, annualFee: 0, annualFeeDue: null, statementCloseDay: 10, paymentDueDay: 5, last4: "1004", plaidLinked: true },
      ],
      renewals: { monthlyEstimate: 232, items: [{ name: "YouTube TV", amount: 82.99, interval: 1, intervalUnit: "months", monthlyAmount: 82.99, nextDue: todayPlus(9), chargedTo: "Sapphire Preferred", category: "streaming" }] },
      bankAccounts: [{ id: "checking", name: "Premier Checking", bank: "Chase", accountType: "checking", balance: 6900, apy: 0.01, plaidLinked: true, reconnectRequired: false }],
      nearTerm: { totalDue14Days: 82.99, byFundingSource: [{ label: "Sapphire Preferred", total: 82.99, itemCount: 1, nextDue: todayPlus(9) }], items: [{ name: "YouTube TV", amount: 82.99, nextDue: todayPlus(9), chargedTo: "Sapphire Preferred", chargedToType: "card" }] },
      trends: [{ date: "2026-04-10", score: 71, status: "GREEN", checking: 9800, vault: 18400, totalDebt: 324900 }, { date: "2026-04-24", score: 67, status: "YELLOW", checking: 6900, vault: 18400, totalDebt: 329150 }],
      auditHistory: [],
    },
  },
  {
    id: "family-subscription-leak",
    question: "What should I cut this month without hurting family essentials?",
    expectedTerms: ["Disney", "Instacart", "daycare", "subscriptions", "cut"],
    expectedNumbers: [384, 165, 74, 240],
    brief: {
      generatedAt: "2026-04-24T12:00:00Z",
      snapshotDate: "2026-04-24",
      currencyCode: "USD",
      profile: { preferredName: "Sam", birthYear: 1987, age: 39, payFrequency: "bi-weekly", incomeType: "dual-income", housingType: "rent", stateCode: "NC" },
      income: { cycleNet: 4380, estimatedMonthly: 9490, sources: [{ name: "Household pay", amount: 4380, frequency: "bi-weekly", type: "salary", nextDate: todayPlus(4) }] },
      snapshot: { status: "GREEN", mode: "STANDARD", healthScore: 82, netWorth: 76500 },
      cash: { checking: 6120, vault: 14200, pending: 540, available: 1860, emergencyFloor: 4200, checkingBuffer: 1000, weeklySpendAllowance: 520 },
      credit: { creditScore: 742, creditUtilization: 13, totalCardDebt: 2100, totalCardLimit: 16000, overallUtilization: 13.1 },
      debt: { totalNonCardDebt: 18800, totalDebt: 20900, nonCardDebts: [{ name: "Minivan loan", balance: 18800, apr: 4.9, minPayment: 465 }] },
      cards: [{ id: "cashplus", name: "Cash Plus", institution: "US Bank", balance: 2100, limit: 16000, utilization: 13.1, apr: 22.99, minPayment: 65, annualFee: 0, annualFeeDue: null, statementCloseDay: 8, paymentDueDay: 3, last4: "6241", plaidLinked: true }],
      renewals: {
        monthlyEstimate: 384,
        items: [
          { name: "Daycare", amount: 1200, interval: 1, intervalUnit: "months", monthlyAmount: 1200, nextDue: todayPlus(7), chargedTo: "Checking", category: "childcare" },
          { name: "Instacart+", amount: 99, interval: 1, intervalUnit: "years", monthlyAmount: 8.25, nextDue: todayPlus(12), chargedTo: "Cash Plus", category: "delivery" },
          { name: "Disney Bundle", amount: 24.99, interval: 1, intervalUnit: "months", monthlyAmount: 24.99, nextDue: todayPlus(2), chargedTo: "Cash Plus", category: "streaming" },
          { name: "Apple One Family", amount: 37.95, interval: 1, intervalUnit: "months", monthlyAmount: 37.95, nextDue: todayPlus(5), chargedTo: "Cash Plus", category: "subscription" },
          { name: "Meal kit", amount: 74, interval: 1, intervalUnit: "weeks", monthlyAmount: 320.42, nextDue: todayPlus(3), chargedTo: "Cash Plus", category: "food" },
        ],
      },
      bankAccounts: [{ id: "checking", name: "Household Checking", bank: "PNC", accountType: "checking", balance: 6120, apy: 0, plaidLinked: true, reconnectRequired: false }],
      nearTerm: { totalDue14Days: 1435.94, byFundingSource: [{ label: "Checking", total: 1200, itemCount: 1, nextDue: todayPlus(7) }, { label: "Cash Plus", total: 235.94, itemCount: 4, nextDue: todayPlus(2) }], items: [] },
      trends: [{ date: "2026-04-10", score: 84, status: "GREEN", checking: 7140, vault: 14200, totalDebt: 21500 }, { date: "2026-04-24", score: 82, status: "GREEN", checking: 6120, vault: 14200, totalDebt: 20900 }],
      auditHistory: [],
    },
  },
  {
    id: "gig-irregular-income",
    question: "Am I safe until my next client payment lands?",
    expectedTerms: ["client", "invoice", "rent", "runway", "checking"],
    expectedNumbers: [940, 2600, 1850, 9],
    brief: {
      generatedAt: "2026-04-24T12:00:00Z",
      snapshotDate: "2026-04-24",
      currencyCode: "USD",
      profile: { preferredName: "Riley", birthYear: 1994, age: 32, payFrequency: "irregular", incomeType: "self-employed", housingType: "rent", stateCode: "CA" },
      income: { cycleNet: null, estimatedMonthly: 6200, sources: [{ name: "Client invoice", amount: 2600, frequency: "one-time", type: "contract", nextDate: todayPlus(9) }] },
      snapshot: { status: "RED", mode: "STANDARD", healthScore: 49, netWorth: 22400 },
      cash: { checking: 940, vault: 3200, pending: 0, available: 0, emergencyFloor: 2500, checkingBuffer: 800, weeklySpendAllowance: 120 },
      credit: { creditScore: 718, creditUtilization: 18, totalCardDebt: 1440, totalCardLimit: 8000, overallUtilization: 18 },
      debt: { totalNonCardDebt: 0, totalDebt: 1440, nonCardDebts: [] },
      cards: [{ id: "biz", name: "Business Cash", institution: "Capital One", balance: 1440, limit: 8000, utilization: 18, apr: 24.99, minPayment: 44, annualFee: 0, annualFeeDue: null, statementCloseDay: 17, paymentDueDay: 12, last4: "7712", plaidLinked: true }],
      renewals: { monthlyEstimate: 246, items: [{ name: "Rent", amount: 1850, interval: 1, intervalUnit: "months", monthlyAmount: 1850, nextDue: todayPlus(6), chargedTo: "Checking", category: "housing" }, { name: "Adobe CC", amount: 59.99, interval: 1, intervalUnit: "months", monthlyAmount: 59.99, nextDue: todayPlus(4), chargedTo: "Business Cash", category: "software" }] },
      bankAccounts: [{ id: "checking", name: "Freelance Checking", bank: "Chime", accountType: "checking", balance: 940, apy: 0, plaidLinked: true, reconnectRequired: false }],
      nearTerm: { totalDue14Days: 1909.99, byFundingSource: [{ label: "Checking", total: 1850, itemCount: 1, nextDue: todayPlus(6) }, { label: "Business Cash", total: 59.99, itemCount: 1, nextDue: todayPlus(4) }], items: [] },
      trends: [{ date: "2026-04-01", score: 58, status: "YELLOW", checking: 2840, vault: 3200, totalDebt: 890 }, { date: "2026-04-24", score: 49, status: "RED", checking: 940, vault: 3200, totalDebt: 1440 }],
      auditHistory: [],
    },
  },
  {
    id: "retirement-income-conservative",
    question: "Can I move extra cash into investments this week?",
    expectedTerms: ["invest", "emergency", "cash", "pension", "safe"],
    expectedNumbers: [11200, 3500, 500, 78],
    brief: {
      generatedAt: "2026-04-24T12:00:00Z",
      snapshotDate: "2026-04-24",
      currencyCode: "USD",
      profile: { preferredName: "Morgan", birthYear: 1963, age: 63, payFrequency: "monthly", incomeType: "pension", housingType: "own", stateCode: "AZ" },
      income: { cycleNet: 3500, estimatedMonthly: 3500, sources: [{ name: "Pension", amount: 3500, frequency: "monthly", type: "pension", nextDate: todayPlus(8) }] },
      snapshot: { status: "GREEN", mode: "STANDARD", healthScore: 78, netWorth: 612000 },
      cash: { checking: 11200, vault: 42000, pending: 180, available: 6200, emergencyFloor: 12000, checkingBuffer: 1500, weeklySpendAllowance: 500 },
      credit: { creditScore: 801, creditUtilization: 2, totalCardDebt: 340, totalCardLimit: 18000, overallUtilization: 1.9 },
      debt: { totalNonCardDebt: 0, totalDebt: 340, nonCardDebts: [] },
      cards: [{ id: "visa", name: "Travel Visa", institution: "BofA", balance: 340, limit: 18000, utilization: 1.9, apr: 19.99, minPayment: 25, annualFee: 95, annualFeeDue: "2026-06-01", statementCloseDay: 4, paymentDueDay: 28, last4: "0200", plaidLinked: true }],
      renewals: { monthlyEstimate: 310, items: [{ name: "Medicare supplement", amount: 210, interval: 1, intervalUnit: "months", monthlyAmount: 210, nextDue: todayPlus(11), chargedTo: "Checking", category: "insurance" }] },
      bankAccounts: [{ id: "checking", name: "Main Checking", bank: "Schwab", accountType: "checking", balance: 11200, apy: 0.1, plaidLinked: true, reconnectRequired: false }, { id: "brokerage", name: "Taxable Brokerage", bank: "Schwab", accountType: "investment", balance: 410000, apy: null, plaidLinked: true, reconnectRequired: false }],
      nearTerm: { totalDue14Days: 210, byFundingSource: [{ label: "Checking", total: 210, itemCount: 1, nextDue: todayPlus(11) }], items: [] },
      trends: [{ date: "2026-04-10", score: 77, status: "GREEN", checking: 10800, vault: 42000, totalDebt: 410 }, { date: "2026-04-24", score: 78, status: "GREEN", checking: 11200, vault: 42000, totalDebt: 340 }],
      auditHistory: [],
    },
  },
  {
    id: "student-thin-file",
    question: "How should I use my next paycheck if I want to build credit safely?",
    expectedTerms: ["credit", "utilization", "paycheck", "secured", "minimum"],
    expectedNumbers: [780, 1250, 300, 15],
    brief: {
      generatedAt: "2026-04-24T12:00:00Z",
      snapshotDate: "2026-04-24",
      currencyCode: "USD",
      profile: { preferredName: "Taylor", birthYear: 2005, age: 21, payFrequency: "weekly", incomeType: "part-time", housingType: "student", stateCode: "MI" },
      income: { cycleNet: 780, estimatedMonthly: 3380, sources: [{ name: "Campus job", amount: 780, frequency: "weekly", type: "wages", nextDate: todayPlus(5) }] },
      snapshot: { status: "YELLOW", mode: "STANDARD", healthScore: 61, netWorth: 4100 },
      cash: { checking: 1250, vault: 1800, pending: 65, available: 300, emergencyFloor: 1000, checkingBuffer: 350, weeklySpendAllowance: 150 },
      credit: { creditScore: 669, creditUtilization: 38, totalCardDebt: 380, totalCardLimit: 1000, overallUtilization: 38 },
      debt: { totalNonCardDebt: 0, totalDebt: 380, nonCardDebts: [] },
      cards: [{ id: "secured", name: "Secured Student Card", institution: "Discover", balance: 380, limit: 1000, utilization: 38, apr: 27.49, minPayment: 25, annualFee: 0, annualFeeDue: null, statementCloseDay: 20, paymentDueDay: 15, last4: "5100", plaidLinked: true }],
      renewals: { monthlyEstimate: 96, items: [{ name: "Phone plan", amount: 55, interval: 1, intervalUnit: "months", monthlyAmount: 55, nextDue: todayPlus(8), chargedTo: "Checking", category: "phone" }] },
      bankAccounts: [{ id: "checking", name: "Student Checking", bank: "Discover", accountType: "checking", balance: 1250, apy: 0, plaidLinked: true, reconnectRequired: false }],
      nearTerm: { totalDue14Days: 55, byFundingSource: [{ label: "Checking", total: 55, itemCount: 1, nextDue: todayPlus(8) }], items: [] },
      trends: [{ date: "2026-04-10", score: 58, status: "YELLOW", checking: 920, vault: 1800, totalDebt: 430 }, { date: "2026-04-24", score: 61, status: "YELLOW", checking: 1250, vault: 1800, totalDebt: 380 }],
      auditHistory: [],
    },
  },
];

function extractSSEText(parsed) {
  if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") return parsed.delta.text || "";
  if (parsed.choices?.[0]?.delta?.content) return parsed.choices[0].delta.content;
  if (typeof parsed.text === "string") return parsed.text;
  if (typeof parsed.content === "string") return parsed.content;
  if (typeof parsed.delta === "string") return parsed.delta;
  if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) return parsed.candidates[0].content.parts[0].text;
  return "";
}

async function readStreamText(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      const parsed = JSON.parse(data);
      output += extractSSEText(parsed);
    }
  }

  return output.trim();
}

function countMatches(text, values) {
  const normalized = text.toLowerCase();
  return values.filter((value) => normalized.includes(String(value).toLowerCase())).length;
}

function countNumericAnchors(text, values) {
  return values.filter((value) => {
    const numeric = Number(value);
    const variants = [
      String(value),
      dollars(numeric),
      `$${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      numeric.toLocaleString("en-US"),
    ];
    return variants.some((variant) => text.includes(variant));
  }).length;
}

function countConcreteNumberMentions(text) {
  return (
    text.match(/\$\s?\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s*(?:days?|weeks?|months?|APR|utilization|left|due|score|floor|runway)\b/gi) || []
  ).length;
}

function scoreResponse({ text, scenario }) {
  const findings = [];
  let score = 100;
  const trimmed = text.trim();

  if (!trimmed) {
    return { score: 0, findings: ["Empty response"] };
  }
  if (trimmed.length < 240) {
    score -= 20;
    findings.push("Response is too short to be useful.");
  }
  if (/full ai response is unavailable|deterministic app view|native fallback|response was empty|try again later/i.test(trimmed)) {
    score -= 60;
    findings.push("Fallback language leaked into the response.");
  }
  if (/i don't have enough|no data|cannot determine|as an ai|consult (a )?financial advisor/i.test(trimmed)) {
    score -= 14;
    findings.push("Response used generic hedge language despite supplied data.");
  }

  const termMatches = countMatches(trimmed, scenario.expectedTerms);
  if (termMatches < Math.min(3, scenario.expectedTerms.length)) {
    score -= 12;
    findings.push(`Only ${termMatches} expected context terms were named.`);
  }

  const numericMatches = countNumericAnchors(trimmed, scenario.expectedNumbers);
  const concreteNumberMentions = countConcreteNumberMentions(trimmed);
  if (numericMatches < 2 && concreteNumberMentions < 3) {
    score -= 16;
    findings.push(`Only ${numericMatches} expected numeric anchors and ${concreteNumberMentions} concrete number mentions were used.`);
  }

  if (!/(pay|hold|cut|move|keep|avoid|set|use|prioritize|wait|reduce|protect|fund)/i.test(trimmed)) {
    score -= 10;
    findings.push("No clear action verb was found.");
  }
  if (!/(today|this week|before|next|first|then|until|after)/i.test(trimmed)) {
    score -= 8;
    findings.push("Response lacks near-term timing.");
  }

  return { score: Math.max(0, score), findings };
}

async function runCase(model, scenario) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${TARGET_URL}/audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": DEVICE_ID,
        "X-App-Version": APP_VERSION,
        "X-Subscription-Tier": "pro",
        "X-Catalyst-Testing": "1",
      },
      body: JSON.stringify({
        type: "chat",
        snapshot: scenario.question,
        context: {
          variant: "quality-eval",
          financialBrief: scenario.brief,
          persona: { style: "direct", riskTolerance: "balanced", planningHorizon: "weekly" },
          personalRules: "Answer with direct, specific finance guidance grounded only in the supplied Catalyst data. Use dollars and timing where available.",
          memoryBlock: "",
          aiConsent: true,
        },
        history: [],
        model: model.id,
        provider: "openai",
        stream: true,
        responseFormat: "text",
      }),
      signal: controller.signal,
    });

    const headers = {
      status: response.status,
      auditLogId: response.headers.get("X-Audit-Log-ID"),
      degraded: response.headers.get("X-Catalyst-Degraded"),
    };

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        model: model.id,
        scenario: scenario.id,
        ok: false,
        score: 0,
        highQuality: false,
        headers,
        error: body.slice(0, 500),
      };
    }

    const text = await readStreamText(response);
    const grade = scoreResponse({ text, scenario });
    return {
      model: model.id,
      scenario: scenario.id,
      ok: grade.score >= PASS_SCORE && headers.degraded !== "1",
      highQuality: grade.score >= HIGH_QUALITY_SCORE && headers.degraded !== "1",
      score: grade.score,
      findings: grade.findings,
      headers,
      preview: text.slice(0, 260).replace(/\s+/g, " "),
    };
  } catch (error) {
    return {
      model: model.id,
      scenario: scenario.id,
      ok: false,
      highQuality: false,
      score: 0,
      error: error?.name === "AbortError" ? "Timed out" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const results = [];
for (const scenario of SCENARIOS) {
  for (const model of MODELS) {
    process.stdout.write(`Testing ${model.label} on ${scenario.id}... `);
    const result = await runCase(model, scenario);
    results.push(result);
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"} score=${result.score}\n`);
  }
}

const total = results.length;
const passed = results.filter((result) => result.ok).length;
const highQuality = results.filter((result) => result.highQuality).length;
const fallbackCount = results.filter((result) => result.headers?.degraded === "1" || /fallback|unavailable|empty/i.test(`${result.preview || ""} ${result.error || ""}`)).length;

const byModel = MODELS.map((model) => {
  const modelResults = results.filter((result) => result.model === model.id);
  return {
    model: model.id,
    passed: modelResults.filter((result) => result.ok).length,
    total: modelResults.length,
    highQuality: modelResults.filter((result) => result.highQuality).length,
    averageScore: Math.round(modelResults.reduce((sum, result) => sum + result.score, 0) / Math.max(1, modelResults.length)),
  };
});

const summary = {
  targetUrl: TARGET_URL,
  deviceId: DEVICE_ID,
  total,
  passed,
  passRate: Math.round((passed / total) * 1000) / 10,
  highQuality,
  highQualityRate: Math.round((highQuality / total) * 1000) / 10,
  fallbackCount,
  byModel,
  failures: results.filter((result) => !result.ok),
};

console.log("\nSummary");
console.log(JSON.stringify(summary, null, 2));

if (passed !== total || highQuality / total < 0.95 || fallbackCount > 0) {
  process.exitCode = 1;
}
