  import { parseAudit } from "./utils.js";

export function getDemoAuditPayload(prevConfig = {}, existingHistory = []) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const dayMs = 86400000;

  // ── 1. ENRICHED DEMO JSON ──────────────────────────────────
  const demoJSON = {
    headerCard: {
      status: "GREEN",
      details: ["Demo audit with sample data", "Your real audit will use your actual finances"],
    },
    healthScore: {
      score: 88,
      grade: "A-",
      trend: "up",
      summary:
        "Excellent financial momentum. Strong savings buffers and aggressive debt paydown are compounding your wealth rapidly.",
      narrative:
        "Your checking is well above floor, vault is fully funded at 6-month coverage, and debt paydown pace puts you on track for freedom by October. The only drag is Chase Sapphire utilization at 24.6% — one more aggressive payment drops you into the optimal range and could boost your credit score 15–25 points.",
    },
    alertsCard: [
      "✅ Car insurance completely covered by Vault",
      "💰 Roth IRA maxed out for the year",
      "⚠️ Chase Sapphire utilization at 24.6% — aim for under 10%",
      "📈 Net worth up $2,340 this week — 7-week growth streak",
      "🎯 $600 away from $25K in savings",
    ],
    dashboardCard: [
      { category: "Checking", amount: "$8,450.00", status: "Above floor" },
      { category: "Vault", amount: "$22,200.00", status: "Fully funded" },
      { category: "Investments", amount: "$45,000.00", status: "Growing" },
      { category: "Other Assets", amount: "$101,000.00", status: "Home Equity" },
      { category: "Pending", amount: "$305.49", status: "3 upcoming" },
      { category: "Debts", amount: "$3,690.00", status: "1 card carrying balance" },
      { category: "Available", amount: "$6,144.51", status: "After obligations" },
    ],
    netWorth: 172960.0,
    netWorthDelta: "+$2,340 vs last week",
    weeklyMoves: [
      "💳 Pay Chase Sapphire $500 — aggressive principal payment to crush 24.99% APR debt",
      "📈 Transfer $1,000 to Vanguard Brokerage — dollar-cost averaging into VTSAX",
      "🏦 Move $400 to Ally Vault — build toward $25K savings milestone",
      "📊 Rebalance crypto allocation — trim BTC gains into ETH position",
      "🎯 Review Q1 sinking fund progress — vacation fund needs $233/mo to hit target",
    ],
    radar: [
      { item: "Netflix", amount: "$15.49", date: new Date(Date.now() + 3 * dayMs).toISOString().split("T")[0] },
      {
        item: "Electric Bill",
        amount: "$145.00",
        date: new Date(Date.now() + 5 * dayMs).toISOString().split("T")[0],
      },
      { item: "Spotify", amount: "$10.99", date: new Date(Date.now() + 8 * dayMs).toISOString().split("T")[0] },
      {
        item: "Car Insurance",
        amount: "$145.00",
        date: new Date(Date.now() + 14 * dayMs).toISOString().split("T")[0],
      },
      {
        item: "Property Tax",
        amount: "$1,100.00",
        date: new Date(Date.now() + 18 * dayMs).toISOString().split("T")[0],
      },
    ],
    longRangeRadar: [
      { item: "Home Maintenance Fund", amount: "$5,000.00", date: "2026-06-01" },
      { item: "Annual Car Registration", amount: "$285.00", date: "2026-07-15" },
      { item: "Family Vacation", amount: "$3,500.00", date: "2026-08-15" },
    ],
    milestones: [
      "Emergency fund fully stocked at 6 months",
      "Net Worth crossed $150K milestone last month",
      "Roth IRA maxed out for 2026",
      "Checking above floor for 8 consecutive weeks",
    ],
    investments: { balance: "$45,000.00", asOf: todayStr, gateStatus: "Open — accelerating contributions" },
    nextAction:
      "Execute the $500 Chase Sapphire payment to crush high-interest debt, then funnel your excess $1,000 into Vanguard to maximize your wealth snowball. After that, move $400 to Ally to close the gap on your $25K savings milestone — you're only $600 away.",
    spendingAnalysis: {
      totalSpent: "$847.23",
      dailyAverage: "$121.03",
      vsAllowance: "UNDER by $152.77",
      topCategories: [
        { category: "Groceries", amount: "$312.50", pctOfTotal: "37%" },
        { category: "Dining", amount: "$187.40", pctOfTotal: "22%" },
        { category: "Gas", amount: "$98.33", pctOfTotal: "12%" },
        { category: "Shopping", amount: "$156.00", pctOfTotal: "18%" },
        { category: "Entertainment", amount: "$93.00", pctOfTotal: "11%" },
      ],
      alerts: ["✅ Under weekly allowance — surplus available for debt acceleration"],
      debtImpact: "At current spending, debt-free by Oct 2026. Cutting $50/week accelerates by 3 weeks.",
    },
    paceData: [
      { name: "Family Vacation", saved: 2100, target: 3500 },
      { name: "Emergency Fund", saved: 14400, target: 15000 },
      { name: "New Laptop", saved: 680, target: 1200 },
      { name: "Holiday Gifts", saved: 350, target: 800 },
    ],
  };
  const raw = JSON.stringify(demoJSON);
  const parsed = parseAudit(raw);

  // ── 2. DEMO PORTFOLIO (cards, bank accounts, renewals) ─────
  const demoCards = [
    {
      id: "demo-card-1",
      institution: "Chase",
      name: "Chase Sapphire Preferred",
      nickname: "Sapphire",
      mask: "4321",
      balance: 3690,
      limit: 15000,
      apr: 24.99,
      lastPaymentDate: today.toISOString(),
      network: "visa",
      monthlyBill: 145,
    },
    {
      id: "demo-card-2",
      institution: "American Express",
      name: "American Express Gold",
      mask: "9876",
      balance: 0,
      limit: 25000,
      apr: 0,
      lastPaymentDate: today.toISOString(),
      network: "amex",
    },
    {
      id: "demo-card-3",
      institution: "Discover",
      name: "Discover it Cash Back",
      mask: "5555",
      balance: 0,
      limit: 8000,
      apr: 0,
      lastPaymentDate: today.toISOString(),
      network: "discover",
    },
  ];
  const demoBankAccounts = [
    {
      id: "demo-chk-1",
      bank: "Chase",
      name: "Chase Total Checking",
      accountType: "checking",
      mask: "7890",
      balance: 8450,
      type: "depository",
      subtype: "checking",
      date: today.toISOString(),
    },
    {
      id: "demo-sav-1",
      bank: "Ally",
      name: "Ally High Yield Savings",
      accountType: "savings",
      mask: "1234",
      balance: 22200,
      type: "depository",
      subtype: "savings",
      date: today.toISOString(),
    },
  ];
  const demoRenewals = [
    {
      id: "demo-ren-1",
      name: "Netflix",
      amount: 15.49,
      interval: 1,
      intervalUnit: "months",
      nextDue: new Date(Date.now() + 3 * dayMs).toISOString().split("T")[0],
      category: "subs",
    },
    {
      id: "demo-ren-2",
      name: "Spotify",
      amount: 10.99,
      interval: 1,
      intervalUnit: "months",
      nextDue: new Date(Date.now() + 8 * dayMs).toISOString().split("T")[0],
      category: "subs",
    },
    {
      id: "demo-ren-3",
      name: "Car Insurance",
      amount: 145.0,
      interval: 1,
      intervalUnit: "months",
      nextDue: new Date(Date.now() + 14 * dayMs).toISOString().split("T")[0],
      category: "insurance",
    },
    {
      id: "demo-ren-4",
      name: "Electric Bill",
      amount: 145.0,
      interval: 1,
      intervalUnit: "months",
      nextDue: new Date(Date.now() + 5 * dayMs).toISOString().split("T")[0],
      category: "utilities",
    },
    {
      id: "demo-ren-5",
      name: "Internet",
      amount: 79.99,
      interval: 1,
      intervalUnit: "months",
      nextDue: new Date(Date.now() + 10 * dayMs).toISOString().split("T")[0],
      category: "utilities",
    },
    {
      id: "demo-ren-6",
      name: "Gym Membership",
      amount: 59.99,
      interval: 1,
      intervalUnit: "months",
      nextDue: new Date(Date.now() + 20 * dayMs).toISOString().split("T")[0],
      category: "subs",
    },
    {
      id: "demo-ren-7",
      name: "Annual Car Registration",
      amount: 285.0,
      interval: 1,
      intervalUnit: "years",
      nextDue: "2026-07-15",
      category: "insurance",
    },
  ];

  const demoPortfolio = { bankAccounts: demoBankAccounts, cards: demoCards, renewals: demoRenewals };

  // ── 3. SYNTHETIC HISTORY (6 weeks of "past audits") ────────
  // These use isDemoHistory: true (NOT isTest) so useDashboardData treats
  // them as real audits for charts, alerts, and freedom stats computation.
  const syntheticWeeks = [
    { weeksAgo: 6, checking: "6200", ally: "19500", debtBal: "5200", nw: 158400, score: 72, grade: "C+", spent: 820 },
    { weeksAgo: 5, checking: "6800", ally: "20100", debtBal: "4850", nw: 161050, score: 75, grade: "B-", spent: 680 },
    { weeksAgo: 4, checking: "7100", ally: "20800", debtBal: "4500", nw: 164200, score: 78, grade: "B", spent: 750 },
    { weeksAgo: 3, checking: "7500", ally: "21300", debtBal: "4200", nw: 167100, score: 81, grade: "B+", spent: 710 },
    { weeksAgo: 2, checking: "7900", ally: "21800", debtBal: "3950", nw: 169850, score: 84, grade: "B+", spent: 690 },
    { weeksAgo: 1, checking: "8200", ally: "22000", debtBal: "3800", nw: 170620, score: 86, grade: "A-", spent: 720 },
  ];
  const syntheticHistory = syntheticWeeks.map(w => {
    const d = new Date(Date.now() - w.weeksAgo * 7 * dayMs);
    const dateStr = d.toISOString().split("T")[0];
    const hJSON = {
      headerCard: { status: w.score >= 80 ? "GREEN" : "YELLOW" },
      healthScore: { score: w.score, grade: w.grade, trend: "up", summary: "Progressing steadily." },
      dashboardCard: [
        {
          category: "Checking",
          amount: `$${Number(w.checking).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          status: "Active",
        },
        {
          category: "Vault",
          amount: `$${Number(w.ally).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          status: "Growing",
        },
        { category: "Investments", amount: "$42,000.00", status: "Steady" },
        { category: "Other Assets", amount: "$101,000.00", status: "Home Equity" },
        {
          category: "Debts",
          amount: `$${Number(w.debtBal).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          status: "Paying down",
        },
      ],
      netWorth: w.nw,
      weeklyMoves: ["Pay debt", "Save more"],
      nextAction: "Keep paying down debt.",
      alertsCard: [],
      radar: [],
      longRangeRadar: [],
      milestones: [],
      investments: { balance: "$42,000.00", asOf: dateStr, gateStatus: "Open" },
    };
    const hRaw = JSON.stringify(hJSON);
    const hParsed = parseAudit(hRaw);
    return {
      ts: d.toISOString(),
      date: dateStr,
      raw: hRaw,
      parsed: hParsed,
      isDemoHistory: true, // NOT isTest — so useDashboardData includes it
      moveChecks: {},
      form: {
        date: dateStr,
        checking: w.checking,
        ally: w.ally,
        budgetActuals: {
          groceries: String(Math.round(w.spent * 0.35)),
          dining: String(Math.round(w.spent * 0.2)),
          transport: String(Math.round(w.spent * 0.15)),
          entertainment: String(Math.round(w.spent * 0.15)),
          shopping: String(Math.round(w.spent * 0.15)),
        },
        debts: [
          { name: "Chase Sapphire", balance: w.debtBal, limit: "15000", apr: "24.99", minPayment: "45", nextDue: "" },
        ],
      },
    };
  });

  // ── 4. CURRENT AUDIT ENTRY ─────────────────────────────────
  const audit = {
    ts: today.toISOString(),
    date: todayStr,
    raw,
    parsed,
    isTest: true,
    moveChecks: {},
    demoPortfolio,
    form: {
      date: todayStr,
      checking: "8450",
      ally: "22200",
      budgetActuals: { groceries: "245", dining: "135", transport: "110", entertainment: "95", shopping: "115" },
      debts: [
        { name: "Chase Sapphire", balance: "3690", limit: "15000", apr: "24.99", minPayment: "45", nextDue: "" },
      ],
    },
  };

  // ── 5. ASSEMBLE HISTORY ────────────────────────────────────
  const existingRealAudits = existingHistory.filter(a => !a.isTest && !a.isDemoHistory);
  const nh = [audit, ...syntheticHistory, ...existingRealAudits].slice(0, 52);

  // ── 6. BUILD FINANCIAL CONFIG OVERLAY (before state updates) ──
  const nextFriday = new Date();
  nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7));
  const demoConfig = {
    ...prevConfig,
    _preDemoSnapshot: prevConfig._preDemoSnapshot || { ...prevConfig }, // Save original for restore
    isDemoConfig: true,
    paycheckStandard: prevConfig.paycheckStandard || 2900,
    payday: prevConfig.payday || nextFriday.toISOString().split("T")[0],
    payFrequency: prevConfig.payFrequency || "bi-weekly",
    trackChecking: true,
    weeklySpendAllowance: prevConfig.weeklySpendAllowance || 800,
    emergencyFloor: prevConfig.emergencyFloor || 2000,
    lastCheckingBalance: 8450,
    incomeSources: prevConfig.incomeSources?.length
      ? prevConfig.incomeSources
      : [{ name: "Salary", amount: 5800, frequency: "biweekly" }],
    budgetCategories: prevConfig.budgetCategories?.length
      ? prevConfig.budgetCategories
      : [
        { name: "Groceries", monthlyTarget: 450, icon: "🛒" },
        { name: "Dining", monthlyTarget: 250, icon: "🍽️" },
        { name: "Transport", monthlyTarget: 200, icon: "🚗" },
        { name: "Entertainment", monthlyTarget: 150, icon: "🎬" },
        { name: "Shopping", monthlyTarget: 200, icon: "🛍️" },
      ],
    // FIRE projection inputs
    fireExpectedReturnPct: prevConfig.fireExpectedReturnPct || 7,
    fireInflationPct: prevConfig.fireInflationPct || 2.5,
    fireSafeWithdrawalPct: prevConfig.fireSafeWithdrawalPct || 4,
    // Investment tracking
    enableHoldings: true,
    track401k: true,
    trackRothContributions: true,
    trackBrokerage: true,
    trackCrypto: true,
    holdings:
      prevConfig.holdings && Object.values(prevConfig.holdings).some(a => a?.length)
        ? prevConfig.holdings
        : {
          k401: [{ symbol: "VFIAX", shares: "245", lastKnownPrice: 450 }],
          roth: [{ symbol: "VTI", shares: "52", lastKnownPrice: 260 }],
          brokerage: [{ symbol: "VTSAX", shares: "85", lastKnownPrice: 118 }],
          crypto: [{ symbol: "BTC", shares: "0.15", lastKnownPrice: 62000 }],
        },
    taxBracketPercent: prevConfig.taxBracketPercent || 22,
    k401ContributedYTD: prevConfig.k401ContributedYTD || 8500,
  };

  return {
    audit,
    nh,
    demoConfig,
    demoCards,
    demoRenewals
  };
}
