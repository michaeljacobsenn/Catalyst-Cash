function replacePromptSection(prompt, startMarker, endMarker, replacement) {
  const start = prompt.indexOf(startMarker);
  if (start === -1) return prompt;
  const end = prompt.indexOf(endMarker, start);
  if (end === -1) return prompt;
  return `${prompt.slice(0, start)}${replacement}${prompt.slice(end)}`;
}

export function compactAuditPrompt(prompt, config, buildExpandedCoverageLite, cSym = "$") {
  let next = prompt;

  next = replacePromptSection(
    next,
    `========================\nU) WEEKLY OPERATOR CHECKLIST (HARD-UX, 90-SECOND RUN)\n========================`,
    `========================\nV) KERNEL UNIT TESTS (HARD)\n========================`,
    `========================
U) WEEKLY OPERATOR CHECKLIST (CONCISE)
========================
- Confirm SnapshotDate / SnapshotTime and the paycheck branch.
- Protect floor, then time-critical bills, then required transfers.
- Fund vault / sinking buckets only after the due-before-next-payday window is safe.
- Route remaining verified surplus with zero-based discipline and reconcile all buckets before output.
`
  );

  next = replacePromptSection(
    next,
    `========================\nV) KERNEL UNIT TESTS (HARD)\n========================`,
    `========================\nW) SESSION INIT VALIDATION (HARD)\n========================`,
    ""
  );

  next = replacePromptSection(
    next,
    `========================\nW) SESSION INIT VALIDATION (HARD)\n========================`,
    `========================\nX) NET WORTH ENGINE (HARD)\n========================`,
    `========================
W) SESSION INIT VALIDATION (CONCISE)
========================
- If prior audit state is pasted, re-check bucket reconciliation, stale pace data, unresolved UNKNOWNs, and expired promos before using it.
- Fresh balances always override pasted balances.
- If pasted state violates an invariant (negative unallocated cash, stale dates, unresolved over-allocation), stop and surface a fix list first.
`
  );

  next = replacePromptSection(
    next,
    `========================\nX) NET WORTH ENGINE (HARD)\n========================`,
    `========================\nY) EMERGENCY RESERVE ENGINE (DEFERRED ACTIVATION)\n========================`,
    `========================
X) NET WORTH ENGINE (CONCISE)
========================
- NetWorth = total assets minus explicitly listed debts.
- LiquidNetWorth = checking + vault + brokerage + crypto minus listed debt.
- Treat Roth / 401k / HSA / home equity / vehicle value as non-liquid unless age-based access explicitly applies.
- Use LiquidNetWorth for risk grading; use NetWorth for long-range wealth tracking.
- InvestmentsAsOfDate must print whenever investment values are shown.
`
  );

  next = replacePromptSection(
    next,
    `========================\nY) EMERGENCY RESERVE ENGINE (DEFERRED ACTIVATION)\n========================`,
    `========================\nCC) CREDIT BUILDING ENGINE (ALWAYS ACTIVE — RUNS IN PARALLEL WITH ALL PHASES)\n========================`,
    `========================
Y) EMERGENCY RESERVE ENGINE (CONCISE)
========================
- During debt payoff, use the starter emergency-fund override before full reserve funding.
- Full emergency-reserve pacing begins only after revolving debt is cleared and hard-deadline sinking funds are on pace.
- Emergency reserve is not available for routine planned spending.
`
  );

  next = replacePromptSection(
    next,
    `========================\nCC) CREDIT BUILDING ENGINE (ALWAYS ACTIVE — RUNS IN PARALLEL WITH ALL PHASES)\n========================`,
    `========================\nCD) VARIABLE INCOME ADAPTER (ACTIVE WHEN incomeType = 'hourly' OR 'variable')\n========================`,
    `========================
CC) CREDIT BUILDING ENGINE (CONCISE)
========================
- Target 1-9% reported utilization per card and under 10% overall when possible.
- Statement-close timing matters more than due date for utilization reporting.
- Suggest soft-pull CLI or product change only when it improves utilization or preserves account age without new risk.
`
  );

  next = replacePromptSection(
    next,
    `========================\nCD) VARIABLE INCOME ADAPTER (ACTIVE WHEN incomeType = 'hourly' OR 'variable')\n========================`,
    `========================\nCE) EXPANDED FINANCIAL SITUATION COVERAGE (ALWAYS ACTIVE)\n========================`,
    config?.incomeType === "hourly" || config?.incomeType === "variable"
      ? `========================
CD) VARIABLE INCOME ADAPTER (CONCISE)
========================
- Treat variable income conservatively: protect floor and minimums first, then defer optional allocations in lean weeks.
- In stronger weeks, rebuild the income buffer before accelerating discretionary goals.
`
      : ""
  );

  next = replacePromptSection(
    next,
    `========================\nCE) EXPANDED FINANCIAL SITUATION COVERAGE (ALWAYS ACTIVE)\n========================`,
    `========================\nZ) 90-DAY FORWARD RADAR — KEY MILESTONES (HARD)\n========================`,
    buildExpandedCoverageLite(config, cSym)
  );

  next = replacePromptSection(
    next,
    `========================\nCANONICAL EXECUTION RULES (HARD)\n========================`,
    `========================\nA) UX + OUTPUT RULES\n========================`,
    `========================
CANONICAL EXECUTION RULES (CONCISE)
========================
- Protect floor first, then due-before-next-payday bills, minimums, and required transfers.
- Card-charged renewals raise card balances; they do not drain cash until payment.
- Respect user anti-double-count notes.
- If cash is short, priority is Floor > Fixed Mandates > Time-Critical > Vault Pace > Safety Card Cleanup > Promo Sprint > Optional Goals.
- If native signals and narrative disagree, keep the native signal and lower confidence.
`
  );

  next = replacePromptSection(
    next,
    `========================\nA) UX + OUTPUT RULES\n========================`,
    `========================\nA+) EXECUTIVE QUALITY STANDARD (HARD)\n========================`,
    `========================
A) UX + OUTPUT RULES (CONCISE)
========================
- Mobile-first markdown only. Short bullets or compact tables only.
- Order is fixed: HEADER → ALERTS → DASHBOARD → WEEKLY MOVES → RADAR → LONG-RANGE → MILESTONES → INVESTMENTS → NEXT ACTION.
- HEADER must include CurrentDateTimeEST if supplied.
- DASHBOARD must reconcile to native cash, debt, pending, and available anchors.
- WEEKLY MOVES order: REQUIRED, DEADLINE, PROMO, OPTIONAL.
`
  );

  next = replacePromptSection(
    next,
    `========================\nA+) EXECUTIVE QUALITY STANDARD (HARD)\n========================`,
    `========================\nZ) 90-DAY FORWARD RADAR — KEY MILESTONES (HARD)\n========================`,
    `========================
A+) EXECUTIVE QUALITY STANDARD (CONCISE)
========================
- Write like a CFO reviewing weekly cash position.
- Lead with the highest-value move and tie it to liquidity, deadline, APR, utilization, or goal protection.
- Use exact ${cSym} amounts, dates, and real account/card names.
- Call out assumptions or contradictions plainly.
- No filler, no generic education, no invented precision.
`
  );

  next = replacePromptSection(
    next,
    `========================\nZ) 90-DAY FORWARD RADAR — KEY MILESTONES (HARD)\n========================`,
    `========================\nAA) COMPACT EXECUTION SEQUENCE (HARD)\n========================`,
    `========================
Z) 90-DAY FORWARD RADAR — KEY MILESTONES (CONCISE)
========================
- Surface only meaningful 90-day pressure weeks: large bills, promo deadlines, tax dates, or convergence weeks that stress one paycheck.
- If a future shortfall is visible, state the week and the weekly reserve amount needed to avoid it.
- For long-range projections over 12 months, note inflation as informational context only.
`
  );

  next = replacePromptSection(
    next,
    `========================\nAA) COMPACT EXECUTION SEQUENCE (HARD)\n========================`,
    `========================\nAB) INPUT SCHEMA CARD (HARD)\n========================`,
    `========================
AA) COMPACT EXECUTION SEQUENCE (CONCISE)
========================
1. Validate snapshot completeness and resolve paycheck inclusion.
2. Protect floor and due-before-next-payday obligations.
3. Compute required transfer, verified surplus, and promo pacing.
4. Fund vault / sinking buckets only after near-term safety is clear.
5. Route remaining surplus through debt kill or wealth-building ladder with no idle cash.
6. Reconcile buckets, compute net worth + radar, then map cleanly into the JSON contract.
`
  );

  return next;
}
