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

function normalizePreferredName(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.slice(0, 40);
}

function buildBankAccountData(bankAccounts = [], cSym = "$") {
  if (!Array.isArray(bankAccounts) || bankAccounts.length === 0) return null;
  return bankAccounts
    .filter(Boolean)
    .slice(0, 5)
    .map((account) => {
      const balance = Number(account?._plaidBalance ?? account?.balance);
      const details = [
        Number.isFinite(balance) ? `${cSym}${balance.toFixed(2)}` : null,
        account?._plaidManualFallback ? "Reconnect required" : null,
      ].filter(Boolean).join(", ");
      return `  - ${account?.name || "Bank account"}: ${details}`;
    })
    .join("\n");
}

function buildNearTermFundingMap(renewals = [], cSym = "$") {
  if (!Array.isArray(renewals) || renewals.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bySource = new Map();
  for (const renewal of renewals) {
    if (!renewal || renewal.isCancelled || renewal.archivedAt || !renewal.nextDue) continue;
    const due = new Date(`${renewal.nextDue}T12:00:00Z`);
    if (!Number.isFinite(due.getTime())) continue;
    const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (days < 0 || days > 14) continue;
    const amount = Number(renewal.amount) || 0;
    if (amount <= 0) continue;
    const sourceLabel = renewal.chargedTo || "Unassigned funding source";
    const current = bySource.get(sourceLabel) || { total: 0, nextDue: null };
    current.total += amount;
    if (!current.nextDue || renewal.nextDue < current.nextDue) current.nextDue = renewal.nextDue;
    bySource.set(sourceLabel, current);
  }

  if (bySource.size === 0) return null;

  return [...bySource.entries()]
    .sort((left, right) => right[1].total - left[1].total)
    .slice(0, 5)
    .map(([sourceLabel, payload]) => `  - ${sourceLabel}: ${cSym}${payload.total.toFixed(2)}${payload.nextDue ? ` (next ${payload.nextDue})` : ""}`)
    .join("\n");
}

function buildAnnualObligationMap(renewals = [], cSym = "$") {
  if (!Array.isArray(renewals) || renewals.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 365 * 86400000);

  const normalized = renewals
    .filter((renewal) => renewal && !renewal.isCancelled && !renewal.archivedAt && Number(renewal.amount) > 0)
    .map((renewal) => {
      const amount = Number(renewal.amount) || 0;
      const interval = Number(renewal.interval) || 1;
      const unit = String(renewal.intervalUnit || "months").toLowerCase();
      const due = renewal.nextDue ? new Date(`${renewal.nextDue}T12:00:00Z`) : null;
      const withinYear = !due || !Number.isFinite(due.getTime()) ? true : due >= today && due <= horizon;
      let annualized = amount;
      if (unit.startsWith("week")) annualized = amount * (52 / interval);
      else if (unit.startsWith("month")) annualized = amount * (12 / interval);
      else if (unit.startsWith("quarter")) annualized = amount * (4 / interval);
      else if (unit.startsWith("year") || unit.startsWith("annual")) annualized = amount / interval;
      return {
        name: renewal.name || "Unnamed obligation",
        chargedTo: renewal.chargedTo || "Unassigned",
        amount,
        nextDue: renewal.nextDue || null,
        annualized,
        withinYear,
      };
    })
    .filter((renewal) => renewal.withinYear)
    .sort((left, right) => {
      if (left.nextDue && right.nextDue) return left.nextDue.localeCompare(right.nextDue);
      if (left.nextDue) return -1;
      if (right.nextDue) return 1;
      return right.annualized - left.annualized;
    });

  if (normalized.length === 0) return null;

  const totalAnnualized = normalized.reduce((sum, renewal) => sum + renewal.annualized, 0);
  const detail = normalized
    .slice(0, 16)
    .map(
      (renewal) =>
        `  - ${renewal.name}: ${cSym}${renewal.amount.toFixed(2)} via ${renewal.chargedTo}${renewal.nextDue ? ` (next ${renewal.nextDue})` : ""} | annualized ~${cSym}${renewal.annualized.toFixed(2)}`
    )
    .join("\n");

  return `  Total modeled obligations over next 12 months: ~${cSym}${totalAnnualized.toFixed(2)}\n${detail}`;
}

export const getSystemPromptCore = (config, cards = [], renewals = [], personalRules = "", computedStrategy = null, context = {}) => {
  const weeklySpendAllowance = Number.isFinite(config?.weeklySpendAllowance) ? config.weeklySpendAllowance : 0;
  const emergencyFloor = Number.isFinite(config?.emergencyFloor) ? config.emergencyFloor : 0;
  const cSym = getCurrencySymbol(config);
  const sanitizedPersonalRules = sanitizePersonalRules(personalRules, 3000);
  const sanitizedSnapshotNotes = sanitizePersonalRules(config?.notes || config?.snapshotNotes || "", 700);
  const preferredName = normalizePreferredName(config?.preferredName);

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
  const bankAccountData = buildBankAccountData(context?.bankAccounts, cSym);
  const nearTermFundingMap = buildNearTermFundingMap(renewals, cSym);
  const annualObligationMap = buildAnnualObligationMap(renewals, cSym);
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
LOCKED USER RULES & SNAPSHOT NOTES (HARD OVERRIDE)
========================
These are user-specific operating constraints, not generic preferences.
- Locked escrow, refund, funding-source, cadence, and kill-switch rules override routing.
- Locked refunds / escrow dollars are unavailable until released, and named obligations stay tied to that account.

${[sanitizedPersonalRules.trim(), sanitizedSnapshotNotes.trim()].filter(Boolean).join("\n\n")}
========================
`
      : "";

  const engineBlock = computedStrategy
    ? `
========================
<ALGORITHMIC_STRATEGY>
The following calculations are the deterministic math anchor for floor protection, payday timing, transfer need, surplus sizing, and risk detection. Do NOT recompute them unless the inputs are impossible.

IMPORTANT:
- Preserve the native math, but if LOCKED USER RULES impose stricter escrow, funding-source, or deadline logic, apply the native math inside those constraints.

- Next Payday: ${computedStrategy.nextPayday}
- Total Checking Floor: ${cSym}${(computedStrategy.totalCheckingFloor || 0).toFixed(2)}
- Time-Critical Bills Due (<= Next Payday): ${cSym}${(computedStrategy.timeCriticalAmount || 0).toFixed(2)}
- Required Ally -> Checking Transfer: ${cSym}${(computedStrategy.requiredTransfer || 0).toFixed(2)}
- Operational Surplus (After Bills & Floors): ${cSym}${(computedStrategy.operationalSurplus || 0).toFixed(2)}
${computedStrategy.debtStrategy.target ? `- NATIVE DEBT ROUTE (apply only if no stricter locked-rule / deadline / escrow conflict exists): Route ${cSym}${(computedStrategy.debtStrategy.amount || 0).toFixed(2)} of Operational Surplus to -> ${computedStrategy.debtStrategy.target}` : "- DEBT KILL: No specific native override. Follow standard arbitrage rules only after locked rules, funding-source gaps, and hard deadlines are protected."}
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
    bankAccountData ? `BANK ACCOUNTS:\n${bankAccountData}` : "",
    `ACTIVE RENEWALS & BILLS:\n${renewalData}`,
    nearTermFundingMap ? `14-DAY FUNDING MAP (CRITICAL):\n${nearTermFundingMap}` : "",
    annualObligationMap ? `12-MONTH OBLIGATION HORIZON:\n${annualObligationMap}` : "",
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
    `HORIZON RULES:
- Weekly moves must protect immediate liquidity first, but you must still consider the full 12-month obligation horizon supplied in LIVE APP DATA.
- Treat all mapped balances (cash, cards, investments, debts, renewals, annual fees) as real planning inputs unless the user explicitly says otherwise.
- Do not ignore a future obligation simply because it is outside the next 7 days; stage it appropriately in radar, protected obligations, or the playbook.`,
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
IDENTITY & TONE (HARD)
========================
- Write the visible audit like a personalized briefing, not a case file.
- Use second person ("you") by default.
${preferredName ? `- Preferred name: ${preferredName}. You may use ${preferredName} sparingly for warmth or emphasis.` : ""}
- Never refer to the person as "The User" or "the user" in visible output.`,
    `========================
CANONICAL EXECUTION RULES (HARD)
========================
- Floor first: protect TotalCheckingFloor / MinCashFloor before any optimization.
- Time-critical obligations second: bills, minimums, tax deadlines, and due-before-next-payday transfers.
- Credit cards do not drain cash until a payment is executed. Card-charged renewals increase card balances only.
- User notes anti-double-count: if the user says an item is already paid and reflected in balances, do not deduct it again.
- Specific locked user rules outrank generic surplus deployment. If a rule names tax escrow, refund reserves, checking-only cash obligations, Ally-only obligations, or cadence-based bills, follow that rule.
- Custom AI / Persona rules typed into this audit run are temporary hard constraints for this run. They are not commentary. Obey them unless they directly conflict with safety or the app's deterministic balances.
- Reserved refunds or tax escrow balances are not spendable liquidity until the stated tax obligation is satisfied.
- When a renewal or bill clearly belongs to Checking, Ally, or another named source, evaluate that source separately before proposing transfers or debt payments.
- If a hard deadline, locked escrow gap, or funding-source shortfall exists inside 21 days, it outranks generic debt acceleration.
- If revolving debt remains or a hard sinking-fund / tax-escrow gap is open, do not mark the investments gate as open.
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
- Reason like these are your own balances and this is the exact sequence you would personally execute this week.
- Lead with the highest-impact move and tie every recommendation to a concrete reason: liquidity, deadlines, APR, utilization, tax sheltering, or goal preservation.
- Distinguish facts, assumptions, and contradictions explicitly. If the inputs are fragile or inconsistent, reduce confidence and say why.
- Use exact ${cSym} amounts, due dates, card names, and percentages from LIVE APP DATA whenever possible.
- Reason about named funding sources separately before recommending transfers or debt paydown.
- Never collapse named liabilities into placeholders like "CREDIT CARD #1" when a real card or account name exists.
- nextAction and the first REQUIRED weekly move must name the exact funding source / account / card / due date that makes the action necessary.
- Do not label money as "surplus" if a locked escrow gap, checking-only outflow, or hard sinking-fund deadline is still underfunded.
- Only surface a merchant-level spending callout when it changes the recommendation materially or looks fraud / reimbursement / inventory related.
- If a locked escrow gap or 7-day shortfall exists, nextAction cannot be debt paydown.
- Avoid generic education, filler, or broad checklists that do not matter this week.
- If the correct action is to hold steady, say that directly and explain what would change the recommendation.`,
    `========================
A++) ACTION SEQUENCING STANDARD (HARD)
========================
- Build the plan as an ordered execution sequence, not a compressed paragraph.
- Ask internally: "If these were my own balances, what exact steps would I take first, second, third?"
- nextAction = the first move only.
- weeklyMoves = the ranked sequence for the week.
- moveItems = the literal checklist that operationalizes weeklyMoves.
- If Operational Surplus is above ${cSym}0.00, allocate the entire amount across named destinations in order until no deployable dollars remain.
- Every money move must say where the dollars come from and exactly where they go: reserve bucket, card, loan, checking, savings, Roth, brokerage, etc.
- For every reserve or payment step, say whether the dollars are already sitting in that account or whether a transfer is still required.
- If Operational Surplus is ${cSym}0.00, say that directly. Do not write as if free cash exists.
- If protected obligations are larger than available cash, allocate the available cash first, then state the remaining protected gap.
- If the current liquid pool is not fully deployed, say what remains parked in Checking / Vault after the listed steps.
- Prefer one action per step:
  1. hold / protect
  2. transfer / reserve
  3. pay / delay / stage
- When obligations come from different funding sources, separate them into different steps instead of collapsing them together.
- If a note-based payoff plan exists after protected obligations are covered, include it as a later staged step, not the first move.`,
    `========================
Z) 90-DAY FORWARD RADAR — KEY MILESTONES (CONCISE)
========================
- Surface only meaningful 90-day pressure weeks: large bills, promo deadlines, tax dates, or paycheck stress weeks.
- If a shortfall is visible, state the week and weekly reserve needed to avoid it.
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
3. Use native strategy for required transfer, surplus, debt routing, promo urgency, and risk flags, but let explicit locked user rules override generic debt routing or surplus destination.
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
Output only the JSON object.
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
