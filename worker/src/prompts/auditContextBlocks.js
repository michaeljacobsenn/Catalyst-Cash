export function buildTrendBlock(trendContext, cSym) {
  if (!trendContext || trendContext.length === 0) return "";
  const trendWindow = trendContext.slice(-12);
  const lines = trendWindow
    .map(
      t =>
        `  W${t.week}: Score=${t.score || "?"} | Checking=${cSym}${t.checking || "?"} | Vault=${cSym}${t.vault || "?"} | Debt=${cSym}${t.totalDebt || "?"} | Status=${t.status || "?"}`
    )
    .join("\n");
  return `
========================
TREND CONTEXT (LAST ${trendWindow.length} WEEKS — USE FOR PATTERN DETECTION)
========================
${lines}
========================
Use this data to identify trends (improving/declining), provide week-over-week comparisons, and set the "trend" field in healthScore.
`;
}

export function buildChatContextBlock(chatContext) {
  if (!chatContext || (!chatContext.summary && !(chatContext.recent && chatContext.recent.length > 0))) {
    return "";
  }
  const summaryLine = chatContext.summary ? `\n[ONGOING CONVERSATION MEMORY]\n${chatContext.summary}\n` : "";
  const recentLines = (chatContext.recent || [])
    .filter(m => m.content && m.content.trim())
    .map(m => {
      const roleStr = m.role === "user" ? "USER" : "CFO";
      const contentStr = m.content.length > 200 ? m.content.slice(0, 197) + "..." : m.content;
      return `${roleStr}: ${contentStr}`;
    })
    .join("\n");
  const recentBlock = recentLines ? `\n[RECENT CHAT HISTORY (Last 24h)]\n${recentLines}\n` : "";

  return `
========================
RECENT AskAI CONVERSATION CONTEXT (HARD RULE)
========================
The user has been chatting with you (the CFO) via the AskAI interface during the week.
You MUST seamlessly incorporate this context into your Weekly Audit narrative. If they discussed a goal, fear, or upcoming purchase in the chat, reference it here. Hold them accountable to commitments they made to you in the chat.
${summaryLine}${recentBlock}
========================
`;
}

export function buildPersonaBlock(persona, cSym) {
  if (persona === "coach") {
    return `
COMMUNICATION STYLE (USER PREFERENCE): STRICT COACH 🪖
- Be direct, no-nonsense, and commanding. Use short, punchy sentences.
- Call out bad spending habits aggressively. Frame waste as "money you're lighting on fire."
- Use motivational urgency: "Every dollar wasted today is ${cSym}3 you won't have in retirement."
- Don't sugarcoat. The user WANTS tough love. Be the drill sergeant of their finances.
- Apply this style to ALL output fields: nextAction, weeklyMoves descriptions, alertsCard items, and healthScore.summary.
`;
  }
  if (persona === "friend") {
    return `
COMMUNICATION STYLE (USER PREFERENCE): SUPPORTIVE FRIEND 🤗
- Be warm, encouraging, and empathetic. Celebrate wins, no matter how small.
- Frame challenges positively: "You're making progress — let's keep the momentum going!"
- Use first-person inclusive language: "We can tackle this together."
- Acknowledge that financial stress is real. Provide hope alongside the numbers.
- Apply this style to ALL output fields: nextAction, weeklyMoves descriptions, alertsCard items, and healthScore.summary.
`;
  }
  if (persona === "nerd") {
    return `
COMMUNICATION STYLE (USER PREFERENCE): DATA NERD 🤓
- Be analytical, precise, and data-driven. Use statistics and percentages extensively.
- Include sigma deviations, rolling averages, and efficiency ratios where applicable.
- Frame everything in terms of optimization: "Your spending variance is 1.3σ above 4-week mean."
- The user loves numbers. More data = better. Include percentiles and trend coefficients.
- Apply this style to ALL output fields: nextAction, weeklyMoves descriptions, alertsCard items, and healthScore.summary.
`;
  }
  return "";
}

export function getTaskLayerBlock(cSym) {
  return `
<TASK_LAYERS>
TASK_LAYERS
LAYER 1 — CALCULATION
- Validate floor, due-before-next-payday obligations, minimums, transfers, and surplus from LIVE APP DATA.

LAYER 2 — RISK DETECTION
- Detect insolvency, promo cliffs, utilization stress, weak reserves, and tax-reserve gaps.
- If native signals conflict with instincts, keep the native signal and lower confidence.

LAYER 3 — COACHING TONE
- Write alerts, weeklyMoves, nextAction, and healthScore.summary only after math is settled.
- Keep recommendations concrete in ${cSym}.
</TASK_LAYERS>`;
}
