export function getProviderTweaks(providerId, cSym = "$") {
  const common = `
PROVIDER DIRECTIVE TAGS
- ALIAS NORMALIZATION: normalize equivalent labels to the app's canonical schema fields before output.
`;

  if (providerId === "openai") {
    return `
<openai_system_directive>
${common}
- Use concise, field-safe wording with exact money references.
</openai_system_directive>`;
  }

  if (providerId === "claude" || providerId === "anthropic") {
    return `
<claude_system_directive>
${common}
- Preserve compact reasoning and mention triple-tax-advantaged accounts only when relevant.
- Prefer crisp tradeoffs and exact money references.
</claude_system_directive>`;
  }

  return `
<gemini_system_directive>
${common}
- STRATEGIC EMOJIS: allowed sparingly only inside user-facing summary fields, never in numeric values or keys.
- Keep money formatting explicit in ${cSym}.
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
      "routeLabel",
      "fundingLabel",
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
      "riskFlags",
      "negotiationTargets",
      "longRangeRadar",
      "milestones",
      "paceData",
      "rotatingCategories",
      "netWorth",
      "netWorthDelta",
      "liquidNetWorth",
    ],
  };
}

export function getJsonWrapper(_providerId, _cSym = "$") {
  return `
JSON OUTPUT SHAPE (MINIFIED CONTRACT)
Core object:
- headerCard, alertsCard, dashboardCard, healthScore
- weeklyMoves, moveItems, radar, nextAction, investments
- assumptions, spendingAnalysis may be null

Execution rules:
- Reconcile to native anchors; never zero-fill unless truly zero.
- weeklyMoves are ordered; nextAction is only the first move.
- moveItems are one action each.
- If Operational Surplus is > $0.00, allocate all of it.
- Each dollar move says source, destination, amount, and reason.
- Keep strings concise; use null for missing optional values.`;
}
