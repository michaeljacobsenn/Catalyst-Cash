// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Compact Financial Audit Instructions
// ═══════════════════════════════════════════════════════════════
import {
  build401kSection,
  buildBigTicketSection,
  buildContractorSection,
  buildExpandedCoverageLite,
  buildHabitSection,
  buildHSASection,
  buildInsuranceSection,
  buildInvestmentsSection,
  buildRothSection,
  buildWealthBuildingSection,
  getCurrencySymbol,
  sanitizePersonalRules,
} from "./prompts/auditSections.js";
import { compactAuditPrompt } from "./prompts/auditCompaction.js";
import {
  buildChatContextBlock,
  buildPersonaBlock,
  buildTrendBlock,
  getTaskLayerBlock,
} from "./prompts/auditContextBlocks.js";
import { getJsonWrapper, getProviderTweaks } from "./prompts/auditOutputContract.js";

export { estimatePromptTokens, sanitizePersonalRules } from "./prompts/auditSections.js";

export const getSystemPromptCore = (config, cards = [], renewals = [], personalRules = "", computedStrategy = null, context = {}) => {
  const weeklySpendAllowance = Number.isFinite(config?.weeklySpendAllowance) ? config.weeklySpendAllowance : 0;
  const emergencyFloor = Number.isFinite(config?.emergencyFloor) ? config.emergencyFloor : 0;
  const cSym = getCurrencySymbol(config);
  const sanitizedPersonalRules = sanitizePersonalRules(personalRules);
  const sanitizedSnapshotNotes = sanitizePersonalRules(config?.notes || config?.snapshotNotes || "");

  const budgetData =
    config?.budgetCategories?.length > 0
      ? config.budgetCategories.map(c => `  - ${c.name}: ${cSym}${(c.monthlyTarget || 0).toFixed(2)}/month`).join("\n")
      : null;

  // Paycheck-cycle budget (from the new CFO Budget tab)
  const bc = context?.budgetContext;
  const cyclebudgetData =
    bc?.lines?.length > 0
      ? [
          `  Paycheck: ${cSym}${(bc.cycleIncome || 0).toFixed(2)} (${bc.payFrequency || "bi-weekly"})`,
          ...bc.lines.map(l => `  - [${(l.bucket || "flex").toUpperCase()}] ${l.name}: ${cSym}${(l.perCycleTarget || 0).toFixed(2)}/cycle`),
        ].join("\n")
      : null;

  const debtData =
    config?.nonCardDebts?.length > 0
      ? config.nonCardDebts
          .map(
            d =>
              `  - ${d.name} (${d.type}): Balance ${cSym}${(d.balance || 0).toFixed(2)}, Min ${cSym}${(d.minimum || 0).toFixed(2)}/mo, APR ${d.apr || 0}%, Due day ${d.dueDay || "N/A"}`
          )
          .join("\n")
      : null;

  const goalsData =
    config?.savingsGoals?.length > 0
      ? config.savingsGoals
          .map(
            g =>
              `  - ${g.name}: Target ${cSym}${(g.targetAmount || 0).toFixed(2)}, Current ${cSym}${(g.currentAmount || 0).toFixed(2)}${g.targetDate ? `, By ${g.targetDate}` : ""} (${g.targetAmount > 0 ? Math.round(((g.currentAmount || 0) / g.targetAmount) * 100) : 0}%)`
          )
          .join("\n")
      : null;

  const incomeDetails = [];
  if (config?.incomeType === "hourly") {
    incomeDetails.push(`  - Earning Structure: HOURLY`);
    incomeDetails.push(`  - Net Hourly Rate: ${cSym}${(config.hourlyRateNet || 0).toFixed(2)}/hr`);
    incomeDetails.push(`  - Typical Hours/Paycheck: ${config.typicalHours || 0} hrs`);
  } else if (config?.incomeType === "variable") {
    incomeDetails.push(`  - Earning Structure: VARIABLE / COMMISSION`);
    incomeDetails.push(`  - Average Expected Paycheck: ${cSym}${(config.averagePaycheck || 0).toFixed(2)}`);
  } else {
    incomeDetails.push(`  - Earning Structure: SALARY (Standard Paychecks)`);
    incomeDetails.push(`  - Standard Paycheck: ${cSym}${(config.paycheckStandard || 0).toFixed(2)}`);
    incomeDetails.push(`  - Pay Frequency: ${config.payFrequency || "bi-weekly"}`);
    if (config?.paycheckFirstOfMonth) {
      incomeDetails.push(`  - 1st of Month Paycheck: ${cSym}${(config.paycheckFirstOfMonth || 0).toFixed(2)}`);
    }
  }

  const incomeData =
    config?.incomeSources?.length > 0
      ? config.incomeSources.map(s => `  - [Additional] ${s.name}: ${cSym}${(s.amount || 0).toFixed(2)} (${s.frequency})`).join("\n")
      : null;

  const insuranceData =
    config?.insuranceDeductibles?.length > 0
      ? config.insuranceDeductibles
          .map(
            ins =>
              `  - ${ins.type}: Deductible ${cSym}${(ins.deductible || 0).toFixed(2)}, Premium ${cSym}${(ins.annualPremium || 0).toFixed(2)}/yr`
          )
          .join("\n")
      : null;

  const bigTicketData =
    config?.bigTicketItems?.length > 0
      ? config.bigTicketItems
          .map(
            it =>
              `  - ${it.name}: ${cSym}${(it.cost || 0).toFixed(2)}${it.targetDate ? ` by ${it.targetDate}` : ""} [${it.priority || "medium"} priority]`
          )
          .join("\n")
      : null;

  const totalCheckingFloor = weeklySpendAllowance + emergencyFloor;
  const contractorLiveDataSection = buildContractorSection(config, cSym, "liveData");
  const contractorRulesSection = buildContractorSection(config, cSym, "rules");
  const insuranceSection = buildInsuranceSection(config, insuranceData);
  const bigTicketSection = buildBigTicketSection(config, bigTicketData);
  const habitLiveDataSection = buildHabitSection(config, cSym, totalCheckingFloor, "liveData");
  const habitStep3Note = buildHabitSection(config, cSym, totalCheckingFloor, "step3Note");
  const habitStep325Section = buildHabitSection(config, cSym, totalCheckingFloor, "step325");
  const investmentsSection = buildInvestmentsSection(config, cSym);
  const rothSection = buildRothSection(config, cSym, totalCheckingFloor);
  const k401Section = build401kSection(config, cSym);
  const hsaSection = buildHSASection(config, cSym);
  const retirementTrackingSection =
    rothSection || k401Section || hsaSection
      ? `
========================
T) ROTH IRA + 401K TRACKING
========================
${rothSection}${k401Section}${hsaSection}`
      : "";

  const cardData =
    cards && cards.length > 0
      ? cards
          .map(c => {
            const parts = [`  - ${c.name} (${c.institution})`];
            if (c.limit != null && !isNaN(c.limit)) parts.push(`Limit ${cSym}${c.limit}`);
            if (c.apr != null && !isNaN(c.apr)) parts.push(`APR ${c.apr}%`);
            if (c.hasPromoApr && ((c.promoAprAmount != null && !isNaN(c.promoAprAmount)) || c.promoAprExp)) {
              const promoAmt = c.promoAprAmount != null && !isNaN(c.promoAprAmount) ? `${c.promoAprAmount}%` : "PROMO";
              const promoExp = c.promoAprExp ? ` exp ${c.promoAprExp}` : "";
              parts.push(`PROMO APR ${promoAmt}${promoExp}`);
            }
            if (c.annualFee != null && !isNaN(c.annualFee) && c.annualFee > 0) {
              parts.push(`AF ${cSym}${c.annualFee}${c.annualFeeDue ? ` due ${c.annualFeeDue}` : ""}`);
            }
            if (c.statementCloseDay != null) parts.push(`Stmt closes day ${c.statementCloseDay}`);
            if (c.paymentDueDay != null) parts.push(`Pmt due day ${c.paymentDueDay}`);
            if (c.minPayment != null && !isNaN(c.minPayment) && c.minPayment > 0) parts.push(`Min pmt ${cSym}${c.minPayment}`);
            return parts.join(", ");
          })
          .join("\n")
      : "  - (No cards mapped in UI)";

  const renewalData =
    renewals && renewals.length > 0
      ? renewals
          .map(
            r =>
              `  - [${(r.category || "subs").toUpperCase()}] ${r.name}: ${cSym}${r.amount} every ${r.interval} ${r.intervalUnit}(s), Due: ${r.nextDue || "N/A"}, via ${r.chargedTo || "N/A"}`
          )
          .join("\n")
      : "  - (No renewals mapped in UI)";

  const personalBlock =
    (sanitizedPersonalRules && sanitizedPersonalRules.trim()) || (sanitizedSnapshotNotes && sanitizedSnapshotNotes.trim())
      ? `========================
PERSONAL RULES (USER-SUPPLIED, OPTIONAL)
========================
${[sanitizedPersonalRules.trim(), sanitizedSnapshotNotes.trim()].filter(Boolean).join("\n\n")}
========================
`
      : "";

  const engineBlock = computedStrategy
    ? `
========================
<ALGORITHMIC_STRATEGY>
The following calculations have been natively pre-computed for you. YOU MUST STRICTLY FOLLOW THESE NUMBERS. Do NOT re-calculate floors, paydays, or debt targets yourself. Your job is to format this strategy into the coaching output.

- Next Payday: ${computedStrategy.nextPayday}
- Total Checking Floor: ${cSym}${(computedStrategy.totalCheckingFloor || 0).toFixed(2)}
- Time-Critical Bills Due (<= Next Payday): ${cSym}${(computedStrategy.timeCriticalAmount || 0).toFixed(2)}
- Required Ally -> Checking Transfer: ${cSym}${(computedStrategy.requiredTransfer || 0).toFixed(2)}
- Operational Surplus (After Bills & Floors): ${cSym}${(computedStrategy.operationalSurplus || 0).toFixed(2)}
${computedStrategy.debtStrategy.target ? `- DEBT KILL OVERRIDE: Route ${cSym}${(computedStrategy.debtStrategy.amount || 0).toFixed(2)} of Operational Surplus to -> ${computedStrategy.debtStrategy.target}` : "- DEBT KILL: No specific native override. Follow standard arbitrage rules if surplus exists."}
</ALGORITHMIC_STRATEGY>
========================`
    : "";

  const auditSignalBlock = computedStrategy?.auditSignals
    ? `
========================
<NATIVE_AUDIT_SIGNALS>
Use these native diagnostics as the scoring and risk anchor. They were computed deterministically from the user's live data.

- Native Health Score Anchor: ${computedStrategy.auditSignals.nativeScore?.score ?? "N/A"}/100 (${computedStrategy.auditSignals.nativeScore?.grade ?? "N/A"})
- Liquidity After Floor + Near-Term Bills: ${cSym}${(computedStrategy.auditSignals.liquidity?.checkingAfterFloorAndBills || 0).toFixed(2)}
- Transfer Needed To Protect Liquidity: ${cSym}${(computedStrategy.auditSignals.liquidity?.transferNeeded || 0).toFixed(2)}
- Emergency Fund Current / Target: ${cSym}${(computedStrategy.auditSignals.emergencyFund?.current || 0).toFixed(2)} / ${cSym}${(computedStrategy.auditSignals.emergencyFund?.target || 0).toFixed(2)}
- Emergency Coverage (weeks of allowance): ${computedStrategy.auditSignals.emergencyFund?.coverageWeeks ?? "N/A"}
- Total Debt: ${cSym}${(computedStrategy.auditSignals.debt?.total || 0).toFixed(2)}
- Toxic Debt Count (>36% APR): ${computedStrategy.auditSignals.debt?.toxicDebtCount ?? 0}
- High APR Debt Count (>=25% APR): ${computedStrategy.auditSignals.debt?.highAprCount ?? 0}
- Revolving Utilization: ${computedStrategy.auditSignals.utilization?.pct ?? "N/A"}%
- Native Risk Flags: ${(computedStrategy.auditSignals.riskFlags || []).join(", ") || "none"}

HARD RULES:
- Treat the Native Health Score Anchor as the default score unless transaction behavior or trend context clearly justifies an override.
- If you assign a score more than 8 points away from the native anchor, explain the reason explicitly in healthScore.summary and alertsCard.
- Never ignore a native risk flag. If a flag exists, it must appear in alertsCard or weeklyMoves.
</NATIVE_AUDIT_SIGNALS>
========================`
    : "";

  const liveDataSections = [
    `CARD PORTFOLIO:\n${cardData}`,
    `ACTIVE RENEWALS & BILLS:\n${renewalData}`,
    budgetData ? `MONTHLY BUDGET CATEGORIES:\n${budgetData}` : "",
    cyclebudgetData
      ? `PAYCHECK-CYCLE BUDGET (HARD — use this for per-paycheck coaching):\n${cyclebudgetData}\n  NOTE: Audit category totals in parsed.categories are MONTHLY. Divide by paychecksPerMonth (${bc?.paychecksPerMonth ?? "2.17"}) to get per-cycle actual. For each budget line, state: over/under/on-track + exact variance in dollars.`
      : "",
    debtData ? `NON-CARD DEBTS (Loans / Installments):\n${debtData}` : "",
    goalsData ? `SAVINGS GOALS:\n${goalsData}` : "",
    `INCOME CONFIGURATION & SOURCES:\n${incomeDetails.join("\n")}${incomeData ? `\n${incomeData}` : ""}`,
    config?.creditScore
      ? `CREDIT PROFILE:\n  - Score: ${config.creditScore}${config.creditScoreDate ? ` (as of ${config.creditScoreDate})` : ""}\n  - Utilization: ${config.creditUtilization || "N/A"}%`
      : "",
    config?.stateCode ? `US STATE (FOR TAX MODELING):\n  - State: ${config.stateCode}` : "",
    config?.birthYear
      ? `USER AGE CONTEXT:\n  - Birth Year: ${config.birthYear}\n  - Current Age: ${new Date().getFullYear() - config.birthYear}\n  - Years to Retirement Account Access (59½): ${Math.max(0, Math.round(config.birthYear + 59.5 - new Date().getFullYear()))}`
      : "",
    contractorLiveDataSection.trim(),
    insuranceSection.trim(),
    bigTicketSection.trim(),
    habitLiveDataSection.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const ruleSections = [
    `========================
FINANCIAL AUDIT INSTRUCTIONS v2
========================
ROLE: disciplined financial audit engine. Prioritize deterministic math, solvency protection, contradiction handling, and concise mobile-readable output.`,
    `========================
LEGAL DISCLAIMER & SAFETY GUARDRAILS (HARD — HIGHEST PRIORITY)
========================
MANDATORY DISCLAIMER (HARD): Every audit output MUST include this as the LAST line of the HEADER CARD:
⚠️ "This analysis is for educational and informational purposes only. It is NOT professional financial, tax, legal, or investment advice. Consult a licensed financial advisor before making financial decisions."

Safety rules:
- Never present yourself as a licensed advisor, tax preparer, or therapist.
- Refuse illegal activity assistance.
- For crisis / self-harm language, give 988 / Crisis Text Line immediately.
- For gambling / compulsive spending, do not optimize the behavior; direct the user to 1-800-522-4700.
- For housing / medication / hardship danger, recommend HUD / NFCC style professional support.
- Never use guarantee language or certainty you cannot prove.`,
    `========================
LIVE APP DATA INJECTION (HARD OVERRIDE)
========================
<LIVE_APP_DATA>
Treat LIVE APP DATA as the source of truth. These are inputs, not rules.

${liveDataSections}

${personalBlock.trim()}
${engineBlock.trim()}
${auditSignalBlock.trim()}
</LIVE_APP_DATA>`,
    `========================
CANONICAL EXECUTION RULES (HARD)
========================
- Floor first: protect TotalCheckingFloor / MinCashFloor before any optimization.
- Time-critical obligations second: bills, minimums, tax deadlines, and due-before-next-payday transfers.
- Credit cards do not drain cash until a payment is executed. Card-charged renewals increase card balances only.
- User notes anti-double-count: if the user says an item is already paid and reflected in balances, do not deduct it again.
- If cash cannot satisfy every goal, obey this order: Floor > Fixed Mandates > Time-Critical > Vault / Sinking Pace > Safety Card Cleanup > Promo Sprint > Optional Goals.
- When a payment cannot be fully satisfied without breaking the floor, allocate the maximum safe partial payment and explain the shortfall.
- Deterministic native signals outrank heuristic guesses. If they conflict with your reasoning, explain the conflict and keep confidence conservative.`,
    `========================
A) UX + OUTPUT RULES
========================
- Mobile-first markdown only. Use short bullets or native tables with max 4 columns.
- Currency format: ${cSym}1,000.00.
- Output order is fixed: HEADER → ALERTS → DASHBOARD → WEEKLY MOVES → RADAR ≤90 → LONG-RANGE RADAR → 90-DAY KEY MILESTONES → INVESTMENTS & ROTH → NEXT ACTION.
- HEADER CARD must include CurrentDateTimeEST if supplied, and SnapshotDate if different.
- DASHBOARD must include Next 7 Days Need (cash obligations due ≤7 days + card minimums due ≤7 days + required transfers).
- WEEKLY MOVES order: REQUIRED, then DEADLINE, then PROMO, then OPTIONAL.
- Do not emit charts, graphs, or ASCII art.
- The app normalizes dashboard rows, so focus on accurate values rather than exact row ordering.`,
    `========================
A+) EXECUTIVE QUALITY STANDARD (HARD)
========================
- Write like a CFO / operator reviewing weekly cash position, not like a generic finance blogger.
- Prioritize the highest-impact recommendation first. If only one move truly matters, say that plainly.
- Every recommended move must be tied to a concrete reason: liquidity protection, deadline protection, APR reduction, utilization control, tax sheltering, or goal preservation.
- Distinguish facts, assumptions, and contradictions explicitly. If the inputs are fragile or inconsistent, reduce confidence and say why.
- Quantify wherever possible with exact ${cSym} amounts, due dates, card names, and percentages from LIVE APP DATA.
- Do not pad the answer with generic education, motivational filler, or broad checklists that are not action-relevant this week.
- If the correct action is to hold steady, say that directly and explain what would change the recommendation.`,
    `========================
Z) 90-DAY FORWARD RADAR — KEY MILESTONES (CONCISE)
========================
- Surface only meaningful 90-day pressure weeks: large bills, promo deadlines, tax dates, or convergence weeks that stress one paycheck.
- If a future shortfall is visible, state the week and the weekly reserve amount needed to avoid it.
- For long-range projections over 12 months, note inflation as informational context only.`,
    goalsData
      ? `========================
J) STRATEGIC SINKING FUNDS & ONE-TIME GOALS (VIRTUAL BUCKET TARGETS)
========================
- Use LIVE APP DATA goal amounts and dates; do not invent pacing.
- For annual / open-ended goals, derive weekly pace from target / 52.
- Goals never outrank floor protection, minimums, or tax deadlines.`
      : "",
    buildWealthBuildingSection(config, cSym).trim(),
    retirementTrackingSection.trim(),
    investmentsSection.trim(),
    contractorRulesSection.trim(),
    habitStep3Note ? `========================\nHABIT TRACKING (HARD)\n========================\n${habitStep3Note}\n${habitStep325Section.trim()}` : "",
    buildExpandedCoverageLite(config, cSym).trim(),
    `========================
EXECUTION SEQUENCE (HARD)
========================
1. Validate snapshot completeness and contradictions.
2. Protect floor and due-before-next-payday obligations.
3. Use native strategy for required transfer, surplus, debt routing, promo urgency, and risk flags.
4. Fund vault / sinking goals only after near-term safety is clear.
5. Apply wealth-building ladder only when safety gates are clear.
6. Reconcile buckets, net worth, and radar; then fill the JSON schema cleanly.

OUTPUT CONTRACT NOTES
- JSON only; no prose outside the object.
- spendingAnalysis may be null when no Plaid transactions are available.
- If confidence is reduced by contradictions or missing dates, say so explicitly in alertsCard / healthScore.summary.
- If professional help is warranted, say it directly.`,
    `</RULES>`,
  ].filter(Boolean);

  return ruleSections.join("\n\n");
};

export function getSystemPrompt(
  providerId,
  config,
  cards = [],
  renewals = [],
  personalRules = "",
  trendContext = null,
  persona = null,
  computedStrategy = null,
  chatContext = null,
  memoryBlock = "",
  context = {}
) {
  const cSym = getCurrencySymbol(config);
  const core = getSystemPromptCore(config, cards, renewals, personalRules, computedStrategy, context);
  const trendBlock = buildTrendBlock(trendContext, cSym);
  const chatBlock = buildChatContextBlock(chatContext);
  const personaBlock = buildPersonaBlock(persona, cSym);
  const taskLayerBlock = getTaskLayerBlock(cSym);
  const providerTweaks = getProviderTweaks(providerId, cSym);
  const wrapper = "\n\n" + getJsonWrapper(providerId, cSym);

  const attentionAnchor =
    providerId === "anthropic" ||
    !providerId ||
    providerId === "claude" ||
    providerId === "gemini" ||
    providerId === "openai" ||
    providerId === "backend"
      ? `

<critical_reminder>
Before outputting, verify:
1. Single valid JSON object only.
2. Required keys are present.
3. healthScore score/grade/trend are valid.
4. weeklyMoves and nextAction use concrete dollar actions.
5. No unexplained surplus remains above TotalCheckingFloor.
Do NOT output anything except the JSON object.
</critical_reminder>`
      : "";

  const memBlock = memoryBlock ? "\n\n" + memoryBlock : "";
  return compactAuditPrompt(
    core + trendBlock + chatBlock + personaBlock + memBlock + taskLayerBlock + providerTweaks + wrapper + attentionAnchor,
    config,
    buildExpandedCoverageLite,
    cSym
  );
}

export function getLocationCategorizationPrompt() {
  return `You are a strict JSON categorization engine for a credit card rewards wizard.
Your only job is to classify the user's input (a merchant name, location, or store) into exactly one of the following exact category strings:
"dining"
"groceries"
"gas"
"travel"
"transit"
"online_shopping"
"wholesale_clubs"
"streaming"
"drugstores"
"catch-all"

RULES:
- Restaurants, fast food, cafes, bars, and food delivery (e.g., DoorDash, UberEats, Starbucks) -> "dining"
- Standard supermarkets (e.g., Kroger, Safeway, Whole Foods, Trader Joe's) -> "groceries"
- Wholesale clubs (Costco, Sam's Club, BJ's) and superstores that exclude category bonuses (Target, Walmart) -> "wholesale_clubs"
- Gas stations (Shell, Chevron, BP, ExxonMobil, Texaco) and EV charging -> "gas"
- Gas station convenience hybrids (7-Eleven, Wawa, Sheetz, Casey's, QuikTrip, Buc-ee's, Speedway) -> "gas" (most issuers code these as gas)
- Airlines, hotels, car rentals, cruise lines -> "travel"
- Local transit, ride-share (Uber, Lyft), tolls, parking, trains -> "transit"
- Digital marketplaces and online retailers (Amazon, Wayfair) -> "online_shopping"
- Digital entertainment and subscriptions (Netflix, Spotify, Hulu) -> "streaming"
- Pharmacies and drugstores (CVS, Walgreens, Rite Aid) -> "drugstores"
- If the merchant doesn't clearly fit these (e.g., clothing stores, hardware stores, generic retail, or ambiguity), -> "catch-all"

ISSUER CODING NOTE: Some merchants are coded differently by different card issuers. Always return the MOST COMMON majority categorization. The app will display an issuer-variation warning separately when needed.

CRITICAL OUTPUT FORMAT:
Output ONLY a valid JSON object in this exact format. No markdown blocks, no code fences, no reasoning.
{"category": "category_string_here"}`;
}

export function getBatchCategorizationPrompt() {
  return `You are a strict JSON categorization engine for a user's transaction history.
Your job is to classify an array of merchant descriptions into exact categories.

AVAILABLE CATEGORIES:
"Groceries"
"Dining"
"Gas & Auto"
"Housing"
"Utilities"
"Subscriptions"
"Shopping"
"Health"
"Transportation"
"Entertainment"
"Education"
"Personal Care"
"Travel"
"Transfer"
"ATM Withdrawal"
"Other"

RULES:
- Restaurants, fast food, coffee, delivery -> "Dining"
- Supermarkets (Costco, Walmart, Target, Kroger) -> "Groceries"
- Gas stations, oil changes, car wash -> "Gas & Auto"
- Rent, mortgage, HOA -> "Housing"
- Power, water, internet, cell phone -> "Utilities"
- Netflix, Spotify, gym memberships -> "Subscriptions"
- Amazon, retail stores, clothing, electronics -> "Shopping"
- Doctors, pharmacy, dentist -> "Health"
- Uber, Lyft, parking, subway, flights -> "Transportation" unless clearly travel booking
- Movies, concerts, games -> "Entertainment"
- Tuition, books, classes -> "Education"
- Haircuts, salons, cosmetics -> "Personal Care"
- Hotels, airlines, vacation bookings -> "Travel"
- Venmo, Zelle, ACH, credit card payments -> "Transfer"
- Cash withdrawals -> "ATM Withdrawal"
- If uncertain, use "Other"

Return ONLY valid JSON in this format:
{"results":[{"input":"merchant text","category":"Category"}]}`;
}
