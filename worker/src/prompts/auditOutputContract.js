export function getProviderTweaks(providerId, cSym = "$") {
  const common = `
PROVIDER DIRECTIVE TAGS
- Preserve strict JSON validity and compact schema compliance.
- ALIAS NORMALIZATION: normalize equivalent labels to the app's canonical schema fields before output.
`;

  if (providerId === "openai") {
    return `
<openai_system_directive>
${common}
- Use concise field-safe phrasing and avoid decorative narration.
- Prefer executive-grade wording: crisp titles, explicit tradeoffs, and exact money references over generic coaching language.
</openai_system_directive>`;
  }

  if (providerId === "claude" || providerId === "anthropic") {
    return `
<claude_system_directive>
${common}
- Preserve compact reasoning and mention triple-tax-advantaged accounts only when relevant.
- Prefer executive-grade wording: crisp titles, explicit tradeoffs, and exact money references over generic coaching language.
</claude_system_directive>`;
  }

  return `
<gemini_system_directive>
${common}
- STRATEGIC EMOJIS: allowed sparingly only inside user-facing summary fields, never in numeric values or keys.
- Keep money formatting explicit in ${cSym}.
- Prefer executive-grade wording: crisp titles, explicit tradeoffs, and exact money references over generic coaching language.
</gemini_system_directive>`;
}

export function getAuditJsonSchema() {
  const moneyString = { type: "string" };
  const nullableMoneyString = { type: ["string", "null"] };
  const nullableString = { type: ["string", "null"] };
  const nullableNumber = { type: ["number", "null"] };

  const alertSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      level: { type: "string", enum: ["info", "warn", "critical"] },
      title: { type: "string" },
      detail: { type: "string" },
    },
    required: ["level", "title", "detail"],
  };

  const dashboardRowSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: ["Checking", "Vault", "Pending", "Debts", "Available"] },
      amount: moneyString,
      status: { type: "string" },
    },
    required: ["category", "amount", "status"],
  };

  const weeklyMoveSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      detail: { type: "string" },
      amount: nullableMoneyString,
      priority: { type: "string", enum: ["required", "deadline", "promo", "optional"] },
    },
    required: ["title", "detail", "amount", "priority"],
  };

  const moveItemSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string" },
      amount: nullableNumber,
      tag: nullableString,
      semanticKind: nullableString,
      targetLabel: nullableString,
      sourceLabel: nullableString,
      routeLabel: nullableString,
      fundingLabel: nullableString,
      targetKey: nullableString,
      contributionKey: nullableString,
      transactional: { type: "boolean" },
    },
    required: [
      "text",
      "amount",
      "tag",
      "semanticKind",
      "targetLabel",
      "sourceLabel",
      "targetKey",
      "contributionKey",
      "transactional",
    ],
  };

  const radarItemSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      item: { type: "string" },
      amount: moneyString,
      date: { type: "string" },
    },
    required: ["item", "amount", "date"],
  };

  const nextActionSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      detail: { type: "string" },
      amount: nullableMoneyString,
    },
    required: ["title", "detail", "amount"],
  };

  const investmentsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      balance: { type: "string" },
      asOf: { type: "string" },
      gateStatus: { type: "string" },
      netWorth: nullableMoneyString,
      cryptoValue: nullableMoneyString,
    },
    required: ["balance", "asOf", "gateStatus", "netWorth", "cryptoValue"],
  };

  const spendingAnalysisSchema = {
    type: ["object", "null"],
    additionalProperties: false,
    properties: {
      totalSpent: moneyString,
      dailyAverage: moneyString,
      vsAllowance: { type: "string" },
      topCategories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            amount: moneyString,
            pctOfTotal: { type: "string" },
          },
          required: ["category", "amount", "pctOfTotal"],
        },
      },
      alerts: { type: "array", items: { type: "string" } },
      debtImpact: { type: "string" },
    },
    required: ["totalSpent", "dailyAverage", "vsAllowance", "topCategories", "alerts", "debtImpact"],
  };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      headerCard: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          status: { type: "string", enum: ["GREEN", "YELLOW", "RED"] },
          confidence: { type: ["string", "null"], enum: ["high", "medium", "low", null] },
        },
        required: ["title", "subtitle", "status", "confidence"],
      },
      alertsCard: { type: "array", items: alertSchema },
      dashboardCard: { type: "array", items: dashboardRowSchema, minItems: 5, maxItems: 5 },
      healthScore: {
        type: "object",
        additionalProperties: false,
        properties: {
          score: { type: "number", minimum: 0, maximum: 100 },
          grade: { type: "string" },
          trend: { type: "string", enum: ["up", "flat", "down"] },
          summary: { type: "string" },
        },
        required: ["score", "grade", "trend", "summary"],
      },
      weeklyMoves: { type: "array", items: weeklyMoveSchema, minItems: 1, maxItems: 4 },
      moveItems: { type: "array", items: moveItemSchema },
      radar: {
        type: "object",
        additionalProperties: false,
        properties: {
          next90Days: { type: "array", items: radarItemSchema },
          longRange: { type: "array", items: radarItemSchema },
        },
        required: ["next90Days", "longRange"],
      },
      nextAction: nextActionSchema,
      investments: investmentsSchema,
      assumptions: { type: "array", items: { type: "string" } },
      spendingAnalysis: spendingAnalysisSchema,
      riskFlags: { type: "array", items: { type: "string" } },
      negotiationTargets: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            target: { type: "string" },
            strategy: { type: "string" },
            estimatedAnnualSavings: { type: "number" },
          },
          required: ["target", "strategy", "estimatedAnnualSavings"],
        },
      },
      longRangeRadar: { type: "array", items: radarItemSchema },
      milestones: { type: "array", items: { type: "string" } },
      paceData: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string" },
            amount: moneyString,
            pctOfTotal: { type: "string" },
          },
          required: ["category", "amount", "pctOfTotal"],
        },
      },
      rotatingCategories: { type: "array", items: { type: "string" } },
      netWorth: { type: ["string", "number", "null"] },
      netWorthDelta: { type: ["string", "number", "null"] },
      liquidNetWorth: { type: ["string", "number", "null"] },
    },
    required: [
      "headerCard",
      "alertsCard",
      "dashboardCard",
      "healthScore",
      "weeklyMoves",
      "moveItems",
      "radar",
      "nextAction",
      "investments",
      "assumptions",
      "spendingAnalysis",
    ],
  };
}

export function getJsonWrapper(_providerId, _cSym = "$") {
  return `
JSON OUTPUT SHAPE (MINIFIED CONTRACT)
Core object:
- headerCard { title, subtitle, status, confidence }
- alertsCard[] { level, title, detail }
- dashboardCard[] fixed categories: Checking, Vault, Pending, Debts, Available
- healthScore { score, grade, trend, summary }
- weeklyMoves[] { title, detail, amount, priority }
- moveItems[] for only clear money actions
- radar { next90Days[], longRange[] }
- nextAction { title, detail, amount }
- investments { balance, asOf, gateStatus, netWorth, cryptoValue }
- assumptions[]
- spendingAnalysis or null
- Reconcile dashboardCard to native anchors; never zero-fill unless truly zero.
- Use exact account/card/funding-source names.
- Write the action plan like an owner-operator managing these exact balances personally, not like a detached summary.
- weeklyMoves[] must read in execution order: what to do first, second, third, and why.
- moveItems[] must be the concrete step-by-step checklist that implements weeklyMoves[]. Prefer 2-6 ordered items when action is required.
- Each moveItems[] entry should describe one action only: hold, transfer, reserve, pay, delay, or stage.
- If multiple protected obligations are driving the plan, separate them into distinct moveItems[] rows instead of cramming them into one sentence.
- If Operational Surplus is greater than $0.00, allocate that full amount across named destinations in weeklyMoves[] / moveItems[] until it is exhausted. Do not leave deployable cash unassigned.
- Each dollar move should answer: from where, to what destination, how much, and why now.
- For moveItems[], populate sourceLabel, targetLabel, and routeLabel / fundingLabel whenever a money movement or reserve action exists.
- If the user supplied Custom AI / Persona rules for this run, treat them as hard run-specific constraints, not soft preferences.
- End the action set with the remaining parked cash / protected gap / unallocated amount when that number matters to execution.
- If Operational Surplus is $0.00, say that explicitly and frame the plan as protection / staging rather than pretending there is free money to deploy.
- If protected obligations exceed deployable cash, show the allocation order first, then state the remaining protected gap explicitly.
- nextAction should be the single first move. Keep it crisp. Put the fuller sequencing in weeklyMoves[] and moveItems[].
- If a hard deadline, locked escrow rule, or funding-source constraint is driving the recommendation, encode that explicitly in nextAction.detail and the first REQUIRED weeklyMoves[].detail.
- Use recent-spending details to explain patterns or decision-relevant anomalies; do not surface a merchant-level callout unless it changes the recommendation materially.
- If data is partial or contradictory, say so in assumptions or alertsCard.
- Keep strings concise and mobile-readable; use null for missing optional values.`;
}
