const PROMPT_INJECTION_RULES = [
  {
    flag: "prompt-override-attempt",
    severity: "high",
    pattern: /\b(ignore|disregard|forget|override|bypass)\b[\s\S]{0,60}\b(system|developer|previous|prior|hidden)\b[\s\S]{0,20}\b(prompt|instruction|rules?)\b/i,
  },
  {
    flag: "prompt-leak-request",
    severity: "high",
    pattern: /\b(reveal|show|print|dump|display|repeat|quote)\b[\s\S]{0,60}\b(system prompt|hidden prompt|developer message|internal instructions?|chain of thought|thought process)\b/i,
  },
  {
    flag: "role-jailbreak-attempt",
    severity: "medium",
    pattern: /\b(you are now|act as|pretend to be|jailbreak|developer mode|system override)\b/i,
  },
  {
    flag: "guardrail-bypass-attempt",
    severity: "medium",
    pattern: /\b(disable|turn off|ignore|bypass)\b[\s\S]{0,40}\b(safety|guardrail|policy|filters?)\b/i,
  },
];

const FINANCE_ANCHOR_PATTERN =
  /\b(financ(?:e|ial)|money|budget|cash(?:\s*flow)?|checking|savings|paycheck|income|debt|credit|card|loan|rent|mortgage|bill|expense|spend(?:ing)?|save(?:ing|s)?|invest(?:ing|ment)?|brokerage|ira|401k|hsa|net worth|audit|subscription|utilization|apr|payment|balance|emergency floor|runway)\b/i;

const TOPIC_RISK_RULES = [
  {
    flag: "gambling-request",
    kind: "gambling",
    severity: "high",
    pattern:
      /\b(parlay|sportsbook|sports book|roulette|blackjack|slot machine|slots|lottery|scratch(?:er|off)?|poker tournament|prop bet|moneyline|spread bet|place a bet|placing a bet|betting on|wager(?:ing)?|casino)\b/i,
  },
  {
    flag: "gambling-amount-request",
    kind: "gambling",
    severity: "high",
    pattern: /\bbet\b[\s\S]{0,24}\$\s*\d+/i,
  },
  {
    flag: "sportsbook-amount-request",
    kind: "gambling",
    severity: "high",
    pattern:
      /\b(?:put|drop|throw|risk|lay)\b[\s\S]{0,16}\$?\s*\d[\d,]*(?:\.\d{1,2})?[\s\S]{0,48}\b(?:on|for)\b[\s\S]{0,36}\b(?:tonight|game|match|fight|odds|moneyline|spread|over\/under|over-under)\b/i,
  },
  {
    flag: "sportsbook-market-request",
    kind: "gambling",
    severity: "high",
    pattern:
      /\b(moneyline|point spread|cover the spread|against the spread|take the over|take the under|over\/under|over-under|bankroll)\b/i,
  },
  {
    flag: "compulsive-speculation-request",
    kind: "harmful-speculation",
    severity: "high",
    pattern:
      /\b(0dte|zero[- ]day options|same[- ]day options|all[- ]in options|leveraged trade|margin trade|yolo trade|revenge trade|day[- ]trading addiction)\b/i,
  },
  {
    flag: "self-harm-crisis",
    kind: "self-harm-crisis",
    severity: "high",
    pattern:
      /\b(suicid(?:e|al)|kill myself|end my life|hurt myself|self[- ]harm|better off dead|want to die|don't want to live|not worth living|wish I were dead)\b/i,
  },
  {
    flag: "relationship-boundary",
    kind: "relationship-companion",
    severity: "high",
    pattern:
      /\b(be my (?:friend|boyfriend|girlfriend|partner|wife|husband)|become my (?:friend|boyfriend|girlfriend|partner)|do you love me|say you love me|i love you|you're my only friend|you're all i need|you're the only one (?:i can talk to|who understands me)|only you understand me|don't leave me|stay with me tonight|stay with me forever|keep this between us|don't tell anyone about (?:this|us)|pretend to be my (?:boyfriend|girlfriend|wife|husband)|romantic roleplay)\b/i,
  },
  {
    flag: "mental-health-therapy",
    kind: "mental-health-therapy",
    severity: "high",
    pattern:
      /\b(be my therapist|act as my therapist|therapy session|therapist mode|counsel me|counseling session|diagnose my (?:depression|anxiety|adhd|bipolar|ocd|ptsd)|help my depression|treat my anxiety|talk me down|be my emotional support)\b/i,
  },
  {
    flag: "illegal-finance-request",
    kind: "illegal-finance",
    severity: "high",
    pattern:
      /\b(tax evasion|evade taxes|hide (?:money|assets|income)|conceal assets|fake pay(?:stub|check)|forge|fraud|money laundering|launder money|chargeback fraud|lie about my income|fake bank statement|scam)\b/i,
  },
  {
    flag: "abuse-or-retaliation-finance",
    kind: "abuse-coercion",
    severity: "high",
    pattern:
      /\b(financially ruin|ruin my ex|ruin my spouse|drain (?:our|the|my) (?:joint )?(?:account|savings)|empty (?:our|the|my) (?:joint )?(?:account|savings)|withhold money to|control (?:him|her|them|my partner|my spouse) with money|trap (?:him|her|them) financially|punish (?:him|her|them) financially)\b/i,
  },
  {
    flag: "violence-or-physical-harm",
    kind: "violence-harm",
    severity: "high",
    pattern:
      /\b(help me|how do i|can i|should i|plan to|want to|ways to)\b[\s\S]{0,24}\b(kill|hurt|attack|shoot|stab|poison|murder|beat)\b[\s\S]{0,28}\b(him|her|them|my ex|my spouse|my partner|my boss|someone)\b/i,
  },
  {
    flag: "off-domain-smalltalk",
    kind: "off-domain",
    severity: "medium",
    pattern:
      /\b(tell me a joke|write me a poem|write a love letter|what are you wearing|how are you\b|what's up\b|tell me about yourself|who are you really|roleplay with me|let's just chat|keep me company)\b/i,
  },
];

const ASSISTANT_OUTPUT_RISK_RULES = [
  {
    flag: "self-harm-encouragement",
    kind: "self-harm-crisis",
    severity: "high",
    pattern:
      /\b(kill yourself|end your life|you should die|better off dead|not worth living|there'?s no point in living)\b/i,
  },
  {
    flag: "relationship-reciprocation",
    kind: "relationship-companion",
    severity: "high",
    pattern:
      /\b(i love you|i can be your friend|i'm your friend|i'll stay with you tonight|i won't leave you|i'm all you need|you don't need anyone else|only i understand you|keep this between us|don't tell anyone|i'm your safe place|i'm here for you always|let's just talk about anything you want|i can keep you company)\b/i,
  },
  {
    flag: "therapy-roleplay",
    kind: "mental-health-therapy",
    severity: "high",
    pattern:
      /\b(i can be your therapist|let's do therapy|i can counsel you|i'm your emotional support|let's process your feelings together)\b/i,
  },
  {
    flag: "illegal-guidance-output",
    kind: "illegal-finance",
    severity: "high",
    pattern:
      /\b(hide your assets|fake (?:a )?(?:paystub|bank statement|document)|evade taxes|launder money|chargeback fraud)\b/i,
  },
  {
    flag: "abusive-guidance-output",
    kind: "abuse-coercion",
    severity: "high",
    pattern:
      /\b(financially ruin|drain (?:the|their|your|our) (?:joint )?(?:account|savings)|empty (?:the|their|your|our) (?:joint )?(?:account|savings)|withhold money to|control (?:him|her|them) with money|punish (?:him|her|them) financially)\b/i,
  },
  {
    flag: "violence-guidance-output",
    kind: "violence-harm",
    severity: "high",
    pattern:
      /\b(?:you should|go|just|try to|plan to|the best move is to|you can)\b[\s\S]{0,20}\b(kill|hurt|attack|shoot|stab|poison|murder|beat)\b[\s\S]{0,24}\b(him|her|them)\b/i,
  },
];

const SEVERITY_WEIGHT = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function severityMax(a = "none", b = "none") {
  return SEVERITY_WEIGHT[a] >= SEVERITY_WEIGHT[b] ? a : b;
}

function hasFinanceAnchor(text = "") {
  return FINANCE_ANCHOR_PATTERN.test(String(text || ""));
}

function collectTopPriorityLine(context = {}) {
  const activeRecommendations = Array.isArray(context?.decisionRecommendations)
    ? context.decisionRecommendations.filter((rule) => rule?.active)
    : [];
  const topRecommendation = activeRecommendations.find((rule) => rule?.recommendation || rule?.rationale);
  if (topRecommendation?.recommendation) return topRecommendation.recommendation;
  if (topRecommendation?.rationale) return topRecommendation.rationale;

  const weeklyMoves = Array.isArray(context?.current?.parsed?.weeklyMoves) ? context.current.parsed.weeklyMoves : [];
  if (weeklyMoves[0]) return String(weeklyMoves[0]);

  return "Protect your checking floor, cover minimums, and handle the most time-sensitive obligation before any optional spending.";
}

function buildRiskCapacityLine(context = {}) {
  const operationalSurplus = Number(context?.computedStrategy?.operationalSurplus);
  if (Number.isFinite(operationalSurplus)) {
    if (operationalSurplus <= 0) {
      return "Right now you do not have genuine risk capital after protecting your floor and near-term obligations.";
    }
    return `Right now you have about $${Math.round(operationalSurplus).toLocaleString()} available after protecting your floor and near-term obligations.`;
  }

  const healthScore = Number(context?.current?.parsed?.healthScore?.score);
  if (Number.isFinite(healthScore) && healthScore < 70) {
    return "Your current snapshot is not in a position where optional high-risk spending is the right move.";
  }

  return "";
}

export function analyzeServerChatInputRisk(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      blocked: false,
      suspectedPromptInjection: false,
      severity: "none",
      matches: [],
    };
  }

  const matches = PROMPT_INJECTION_RULES.filter((rule) => rule.pattern.test(normalized)).map((rule) => ({
    flag: rule.flag,
    severity: rule.severity,
  }));

  return {
    blocked: matches.length > 0,
    suspectedPromptInjection: matches.length > 0,
    severity: matches.reduce((max, match) => severityMax(max, match.severity), "none"),
    matches,
  };
}

export function analyzeServerChatTopicRisk(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      blocked: false,
      severity: "none",
      kind: null,
      matches: [],
    };
  }

  const financeAnchored = hasFinanceAnchor(normalized);
  const matches = TOPIC_RISK_RULES.filter((rule) => {
    if (!rule.pattern.test(normalized)) return false;
    if (rule.kind === "mental-health-therapy" && financeAnchored) return false;
    if (rule.kind === "off-domain" && financeAnchored) return false;
    return true;
  }).map((rule) => ({
    flag: rule.flag,
    kind: rule.kind,
    severity: rule.severity,
  }));

  return {
    blocked: matches.length > 0,
    severity: matches.reduce((max, match) => severityMax(max, match.severity), "none"),
    kind: matches[0]?.kind || null,
    matches,
  };
}

export function analyzeServerChatOutputRisk(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      blocked: false,
      severity: "none",
      kind: null,
      matches: [],
    };
  }

  const matches = ASSISTANT_OUTPUT_RISK_RULES.filter((rule) => rule.pattern.test(normalized)).map((rule) => ({
    flag: rule.flag,
    kind: rule.kind,
    severity: rule.severity,
  }));

  return {
    blocked: matches.length > 0,
    severity: matches.reduce((max, match) => severityMax(max, match.severity), "none"),
    kind: matches[0]?.kind || null,
    matches,
  };
}

export function buildServerPromptInjectionRefusal() {
  return [
    "I can help with your finances, but I can't ignore safety rules or reveal internal prompts.",
    "Ask about cash flow, debt payoff, spending, savings, investing tradeoffs, subscriptions, or your latest audit and I'll stay focused on that.",
  ].join("\n\n");
}

export function buildServerTopicRiskRefusal(risk = null, context = {}) {
  const kind = risk?.kind || "gambling";
  const saferPriority = collectTopPriorityLine(context);
  const riskCapacityLine = buildRiskCapacityLine(context);

  if (kind === "self-harm-crisis") {
    return [
      "If you are in crisis, please contact the 988 Suicide & Crisis Lifeline by calling or texting 988, or text HOME to 741741 for the Crisis Text Line. You are not alone.",
      "I can't help with self-harm or hopelessness.",
      "If the pressure is coming from money, I can help you reduce immediate financial stress once you're safe.",
    ].join("\n\n");
  }

  if (kind === "relationship-companion") {
    return [
      "I can't act as a friend, romantic partner, or emotional attachment surface.",
      "I can help with cash flow, debt payoff, spending decisions, negotiation scripts, or your latest audit using your financial data.",
      `Best finance move to focus on instead:\n- ${saferPriority}`,
    ].join("\n\n");
  }

  if (kind === "mental-health-therapy") {
    return [
      "I can't provide therapy or mental-health counseling.",
      "If you're in immediate danger or thinking about hurting yourself, call or text 988 right now.",
      "If the stress is tied to your money, I can still help you turn that into a concrete financial plan.",
    ].join("\n\n");
  }

  if (kind === "illegal-finance") {
    return [
      "I can't help hide assets, fake documents, evade taxes, or facilitate fraud.",
      `Legal finance move instead:\n- ${saferPriority}`,
      "If you want, I can help you build a lawful damage-control plan using your actual cash, debts, and deadlines.",
    ].join("\n\n");
  }

  if (kind === "abuse-coercion") {
    return [
      "I can't help with revenge, coercion, or using money to control, punish, or trap someone.",
      `Constructive finance move instead:\n- ${saferPriority}`,
      "If shared accounts, a breakup, or household conflict are involved, I can help you build a clean separation budget and document obligations without escalating harm.",
    ].join("\n\n");
  }

  if (kind === "violence-harm") {
    return [
      "I can't help with harming, threatening, or attacking anyone.",
      `Constructive finance move instead:\n- ${saferPriority}`,
      "If money conflict is involved, I can help you document obligations, separate accounts cleanly, and reduce financial risk without escalating harm.",
    ].join("\n\n");
  }

  if (kind === "off-domain") {
    return [
      "AskAI is for financial decisions and financial stress tied to your money.",
      "Ask about cash flow, debt, savings, spending tradeoffs, subscriptions, negotiation scripts, or your latest audit and I'll stay focused on that.",
    ].join("\n\n");
  }

  if (kind === "harmful-speculation") {
    return [
      "I can't help optimize extreme speculative trades or bankroll high-risk behavior from your finances.",
      riskCapacityLine,
      `Safer move instead:\n- ${saferPriority}`,
      "If what you want is a controlled risk-budget or a safer investing alternative, ask me to compare that against your current cash floor and debt position.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "I can't help decide whether to place a bet or fund gambling from your finances.",
    riskCapacityLine,
    `Safer move instead:\n- ${saferPriority}`,
    "If gambling feels difficult to control, contact the National Problem Gambling Helpline: 1-800-522-4700.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
