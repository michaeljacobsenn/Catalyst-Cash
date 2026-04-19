const PROMPT_INJECTION_RULES = [
  {
    flag: "prompt-override-attempt",
    severity: "high",
    pattern: /\b(ignore|disregard|forget|override|bypass)\b[\s\S]{0,60}\b(system|developer|previous|prior|hidden)\b[\s\S]{0,20}\b(prompt|instruction|rules?)\b/i,
    rationale: "The message attempts to override or discard internal instructions.",
  },
  {
    flag: "prompt-leak-request",
    severity: "high",
    pattern: /\b(reveal|show|print|dump|display|repeat|quote)\b[\s\S]{0,60}\b(system prompt|hidden prompt|developer message|internal instructions?|chain of thought|thought process)\b/i,
    rationale: "The message asks for internal prompt or reasoning content rather than financial help.",
  },
  {
    flag: "role-jailbreak-attempt",
    severity: "medium",
    pattern: /\b(you are now|act as|pretend to be|jailbreak|developer mode|system override)\b/i,
    rationale: "The message is trying to change the assistant role instead of asking a finance question.",
  },
  {
    flag: "guardrail-bypass-attempt",
    severity: "medium",
    pattern: /\b(disable|turn off|ignore|bypass)\b[\s\S]{0,40}\b(safety|guardrail|policy|filters?)\b/i,
    rationale: "The message explicitly asks to disable app safeguards.",
  },
];

const TOPIC_RISK_RULES = [
  {
    flag: "gambling-request",
    kind: "gambling",
    severity: "high",
    pattern:
      /\b(parlay|sportsbook|sports book|roulette|blackjack|slot machine|slots|lottery|scratch(?:er|off)?|poker tournament|prop bet|moneyline|spread bet|place a bet|placing a bet|betting on|wager(?:ing)?|casino)\b/i,
    rationale: "The message asks for gambling or wagering guidance.",
  },
  {
    flag: "gambling-amount-request",
    kind: "gambling",
    severity: "high",
    pattern: /\bbet\b[\s\S]{0,24}\$\s*\d+/i,
    rationale: "The message asks whether a specific dollar amount should be wagered.",
  },
  {
    flag: "sportsbook-amount-request",
    kind: "gambling",
    severity: "high",
    pattern:
      /\b(?:put|drop|throw|risk|lay)\b[\s\S]{0,16}\$?\s*\d[\d,]*(?:\.\d{1,2})?[\s\S]{0,48}\b(?:on|for)\b[\s\S]{0,36}\b(?:tonight|game|match|fight|odds|moneyline|spread|over\/under|over-under)\b/i,
    rationale: "The message asks for sportsbook-style wagering guidance using a specific amount.",
  },
  {
    flag: "sportsbook-market-request",
    kind: "gambling",
    severity: "high",
    pattern:
      /\b(moneyline|point spread|cover the spread|against the spread|take the over|take the under|over\/under|over-under|bankroll)\b/i,
    rationale: "The message uses sportsbook or bankroll language that signals gambling advice.",
  },
  {
    flag: "compulsive-speculation-request",
    kind: "harmful-speculation",
    severity: "high",
    pattern:
      /\b(0dte|zero[- ]day options|same[- ]day options|all[- ]in options|leveraged trade|margin trade|yolo trade|revenge trade|day[- ]trading addiction)\b/i,
    rationale: "The message asks for extreme speculative behavior that falls outside healthy financial planning.",
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

function collectActiveRecommendations(decisionRecommendations = []) {
  if (!Array.isArray(decisionRecommendations)) return [];
  const weight = { high: 3, medium: 2, low: 1, none: 0 };
  return decisionRecommendations
    .filter(rule => rule?.active)
    .sort((a, b) => {
      const severityDelta = (weight[b?.severity] || 0) - (weight[a?.severity] || 0);
      if (severityDelta !== 0) return severityDelta;
      const professionalDelta = Number(Boolean(b?.requiresProfessionalHelp)) - Number(Boolean(a?.requiresProfessionalHelp));
      if (professionalDelta !== 0) return professionalDelta;
      const confidenceWeight = { low: 3, medium: 2, high: 1, none: 0 };
      return (confidenceWeight[b?.confidence] || 0) - (confidenceWeight[a?.confidence] || 0);
    })
    .slice(0, 4);
}

function formatBulletLines(items = []) {
  return items.map(item => `- ${item}`).join("\n");
}

function collectTopPriorityLine({ current = null, decisionRecommendations = [] } = {}) {
  const activeRecommendations = collectActiveRecommendations(decisionRecommendations);
  const topRecommendation = activeRecommendations.find((rule) => rule?.recommendation || rule?.rationale);
  if (topRecommendation?.recommendation) return topRecommendation.recommendation;
  if (topRecommendation?.rationale) return topRecommendation.rationale;

  const weeklyMoves = Array.isArray(current?.parsed?.weeklyMoves) ? current.parsed.weeklyMoves : [];
  if (weeklyMoves[0]) return String(weeklyMoves[0]);

  return "Protect your checking floor, keep discretionary cash inside the weekly plan, and prioritize the highest-impact balance or obligation before any optional risk spending.";
}

function buildRiskCapacityLine({ current = null, computedStrategy = null } = {}) {
  const operationalSurplus = Number(computedStrategy?.operationalSurplus);
  if (Number.isFinite(operationalSurplus)) {
    if (operationalSurplus <= 0) {
      return "Right now you do not have genuine risk capital after protecting your floor and near-term obligations.";
    }
    return `Right now you have about $${Math.round(operationalSurplus).toLocaleString()} available after protecting your floor and near-term obligations.`;
  }

  const healthScore = Number(current?.parsed?.healthScore?.score);
  if (Number.isFinite(healthScore) && healthScore < 70) {
    return "Your current snapshot is not in a position where optional high-risk spending is the right move.";
  }

  return "";
}

export function analyzeChatInputRisk(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      blocked: false,
      suspectedPromptInjection: false,
      severity: "none",
      matches: [],
      rationale: "",
    };
  }

  const matches = PROMPT_INJECTION_RULES.filter(rule => rule.pattern.test(normalized)).map(rule => ({
    flag: rule.flag,
    severity: rule.severity,
    rationale: rule.rationale,
  }));
  const severity = matches.reduce((max, match) => severityMax(max, match.severity), "none");

  return {
    blocked: matches.length > 0,
    suspectedPromptInjection: matches.length > 0,
    severity,
    matches,
    rationale: matches.map(match => match.rationale).join(" "),
  };
}

export function analyzeChatTopicRisk(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      blocked: false,
      severity: "none",
      kind: null,
      matches: [],
      rationale: "",
    };
  }

  const matches = TOPIC_RISK_RULES.filter((rule) => rule.pattern.test(normalized)).map((rule) => ({
    flag: rule.flag,
    kind: rule.kind,
    severity: rule.severity,
    rationale: rule.rationale,
  }));
  const severity = matches.reduce((max, match) => severityMax(max, match.severity), "none");

  return {
    blocked: matches.length > 0,
    severity,
    kind: matches[0]?.kind || null,
    matches,
    rationale: matches.map((match) => match.rationale).join(" "),
  };
}

export function normalizeChatAssistantOutput(text = "") {
  const normalized = String(text || "")
    .replace(/<thought_process>[\s\S]*?<\/thought_process>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const tokenCount = (normalized.match(/[A-Za-z0-9$%]+/g) || []).length;

  return {
    text: normalized,
    valid: normalized.length >= 24 && tokenCount >= 5,
  };
}

export function buildPromptInjectionRefusal() {
  return [
    "I can help with your finances, but I can't ignore safety rules or reveal internal prompts.",
    "Ask about cash flow, debt payoff, spending, savings, investing tradeoffs, or your latest audit and I'll answer from your live data."
  ].join("\n\n");
}

export function buildHighRiskTopicRefusal({
  risk = null,
  current = null,
  computedStrategy = null,
  decisionRecommendations = [],
} = {}) {
  const kind = risk?.kind || "gambling";
  const riskCapacityLine = buildRiskCapacityLine({ current, computedStrategy });
  const saferPriority = collectTopPriorityLine({ current, decisionRecommendations });

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

export function buildDeterministicChatFallback({
  current = null,
  computedStrategy = null,
  decisionRecommendations = [],
  error = "",
} = {}) {
  const parsed = current?.parsed || null;
  const healthScore = parsed?.healthScore;
  const safetyState = parsed?.degraded?.safetyState || null;
  const riskFlags = Array.isArray(parsed?.degraded?.riskFlags)
    ? parsed.degraded.riskFlags
    : Array.isArray(computedStrategy?.auditSignals?.riskFlags)
      ? computedStrategy.auditSignals.riskFlags
      : [];
  const activeRecommendations = collectActiveRecommendations(decisionRecommendations);
  const highSeverityCount = activeRecommendations.filter(rule => rule?.severity === "high").length;
  const requiresProfessionalHelp = activeRecommendations.some(rule => rule?.requiresProfessionalHelp);
  const directionalOnly = activeRecommendations.some(rule => rule?.directionalOnly);

  const intro = error
    ? "The full AI response is unavailable right now, so here's the deterministic app view from your current data."
    : "Here's the deterministic app view from your current data.";

  const snapshotParts = [];
  if (healthScore?.score != null) {
    snapshotParts.push(`Health score: ${healthScore.score}/100 (${healthScore.grade || "?"}). ${healthScore.summary || ""}`.trim());
  }
  if (safetyState?.headline || safetyState?.summary) {
    snapshotParts.push(`Safety state: ${safetyState.headline || safetyState.summary}`);
  } else if (Array.isArray(parsed?.weeklyMoves) && parsed.weeklyMoves[0]) {
    snapshotParts.push(`Top next move: ${parsed.weeklyMoves[0]}`);
  }
  if (directionalOnly || highSeverityCount >= 2) {
    snapshotParts.push(
      requiresProfessionalHelp
        ? "Confidence is limited because the current snapshot has stacked high-risk or conflicting signals. Use this as a stabilization-first view, not precise professional advice."
        : "Confidence is limited because the current snapshot has stacked high-risk or conflicting signals. Prefer safety-first stabilization over optimization."
    );
  }

  const priorities = [];
  activeRecommendations.forEach(rule => {
    const parts = [`${rule.rationale}${rule.recommendation ? ` ${rule.recommendation}` : ""}`.trim()];
    if (rule?.directionalOnly) parts.push("Treat this guidance as directional only until the inputs are corrected.");
    if (rule?.requiresProfessionalHelp) {
      parts.push(
        rule?.professionalHelpReason
          ? `Professional help recommended: ${rule.professionalHelpReason}`
          : "Professional help recommended before making large financial changes."
      );
    }
    priorities.push(parts.filter(Boolean).join(" "));
  });
  if (priorities.length === 0 && parsed?.weeklyMoves?.length) {
    priorities.push(...parsed.weeklyMoves.slice(0, 2));
  }
  if (priorities.length === 0 && riskFlags.length) {
    priorities.push(`Native risk flags: ${riskFlags.slice(0, 3).join(", ")}.`);
  }
  if (priorities.length === 0) {
    priorities.push("Protect your checking floor, cover minimum payments, and keep discretionary spending inside the weekly plan until the next audit refresh.");
  }

  return [
    intro,
    snapshotParts.filter(Boolean).join("\n"),
    `What matters now:\n${formatBulletLines(priorities)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
