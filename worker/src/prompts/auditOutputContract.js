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

export function getJsonWrapper(_providerId, cSym = "$") {
  return `
JSON OUTPUT SHAPE (MINIFIED CONTRACT)
{
  "headerCard": { "title": "string", "subtitle": "string", "status": "green|yellow|red" },
  "alertsCard": [{ "level": "info|warn|critical", "title": "string", "detail": "string" }],
  "dashboardCard": [{ "label": "string", "value": "${cSym}0.00", "tone": "good|neutral|warn|bad", "note": "string|null" }],
  "healthScore": { "score": 0, "grade": "A-F", "trend": "up|flat|down", "summary": "string" },
  "weeklyMoves": [{ "title": "string", "detail": "string", "amount": "${cSym}0.00|null", "priority": "required|deadline|promo|optional" }],
  "moveItems": [{ "text": "string", "amount": 0, "tag": "string|null", "semanticKind": "string|null", "targetLabel": "string|null", "sourceLabel": "string|null", "targetKey": "string|null", "contributionKey": "string|null", "transactional": true }],
  "radar": { "next90Days": [], "longRange": [] },
  "nextAction": { "title": "string", "detail": "string", "amount": "${cSym}0.00|null" },
  "spendingAnalysis": null
}
- Required top-level anchors: headerCard, healthScore, weeklyMoves.
- Add moveItems only for clear money actions.
- Use null for optional sections when data is missing; do not invent placeholders.`;
}
