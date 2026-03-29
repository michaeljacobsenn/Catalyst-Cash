import { getCurrency } from "../promptSupport.js";

const isRothTrackingEnabled = config => Boolean(config?.trackRoth === true || config?.trackRothContributions === true);
const is401kTrackingEnabled = config => config?.track401k === true;
const isHSATrackingEnabled = config => config?.trackHSA === true;
const isInvestmentTrackingEnabled = config =>
  Boolean(
    isRothTrackingEnabled(config) ||
      is401kTrackingEnabled(config) ||
      config?.trackBrokerage === true ||
      isHSATrackingEnabled(config) ||
      config?.trackCrypto === true ||
      config?.enableHoldings
  );

export function getCurrencySymbol(config) {
  return config?.currencyCode ? getCurrency(config.currencyCode).symbol : "$";
}

export function estimatePromptTokens(prompt) {
  return Math.ceil(String(prompt || "").length / 4);
}

export function sanitizePersonalRules(rules, maxChars = 4000) {
  if (typeof rules !== "string") return "";

  const injectionLinePattern = /(ignore previous|forget|new instructions|you are now|override|disregard)/i;

  return rules
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .filter(line => !injectionLinePattern.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([*_`~[\]#>])/g, "\\$1")
    .trim()
    .slice(0, Math.max(500, Number(maxChars) || 4000));
}

export function buildContractorSection(config, cSym = "$", placement = "all") {
  if (!config?.isContractor) return "";

  const liveData = `
TAX / SELF-EMPLOYMENT:
  - Withholding Rate: ${config.taxWithholdingRate || 0}%
  - Quarterly Estimate: ${cSym}${(config.quarterlyTaxEstimate || 0).toFixed(2)}
  - Due Dates: Apr 15, Jun 15, Sep 15, Jan 15
`;

  const rules = `
========================
K) TAX SETTLEMENT ESCROW (IF APPLICABLE)
========================
- Treat contractor taxes as mandatory reserves before discretionary debt acceleration.
- If contractor tax setup is missing, confidence must drop and the output should recommend CPA / tax-pro help.
- Apply LIVE APP DATA and PERSONAL RULES for any dedicated tax escrow or refund holdback.
`;

  if (placement === "liveData") return liveData;
  if (placement === "rules") return rules;
  return `${liveData}${rules}`;
}

export function buildInsuranceSection(config, insuranceData) {
  if (!config?.insuranceDeductibles?.length || !insuranceData) return "";
  return `
INSURANCE DEDUCTIBLES:
${insuranceData}
- Mention them only when they affect liquidity, reserve sizing, or a near-term medical / claim risk.
`;
}

export function buildBigTicketSection(config, bigTicketData) {
  if (!config?.bigTicketItems?.length || !bigTicketData) return "";
  return `
BIG-TICKET PURCHASE PLANS:
${bigTicketData}
- Big-ticket plans are optional until floor, minimums, and promo deadlines are protected.
`;
}

export function buildHabitSection(config, cSym = "$", totalCheckingFloor = 0, placement = "all") {
  if (config?.trackHabits === false) return "";

  const liveData = `
HABIT TRACKING:
  - Habit: ${config.habitName || "Habit"}
  - Current Count: ${config.habitCount || 0} units
  - Restock Cost: ${cSym}${(config.habitRestockCost || 0).toFixed(2)}
  - Critical Threshold: ${config.habitCriticalThreshold || 3}
`;

  const step3Note = `- If Habit tracking is enabled, apply PERSONAL RULES for any habit-related timing/amount and defer rules.`;

  const step325 = `
Step 3.25: SMART DEFERRAL — HABIT vs FLOOR (HARD)
- If restocking would push projected checking below ${cSym}${totalCheckingFloor.toFixed(2)} or leave a due-before-next-payday bill short, defer it one payday unless HabitCount <= ${config.habitCriticalThreshold || 3}.
- If HabitCount <= ${config.habitCriticalThreshold || 3}, allow the restock, mark floor stress, and add a catch-up move.
- Record either "HABIT DEFERRED" or the approved restock action explicitly in WEEKLY MOVES.
`;

  if (placement === "liveData") return liveData;
  if (placement === "step3Note") return step3Note;
  if (placement === "step325") return step325;
  return `${liveData}${step3Note}\n${step325}`;
}

export function buildInvestmentsSection(config, _cSym = "$") {
  if (!isInvestmentTrackingEnabled(config)) return "";

  return `
========================
S) INVESTMENTS & CRYPTO (REFERENCE — DO NOT DELETE)
========================
- Use LIVE APP DATA balances/holdings when present; do not invent allocations, returns, or missing balances.
- Treat brokerage, retirement, and crypto as wealth context, not emergency liquidity.
- Crypto is volatile: include it in net worth, never in reserve coverage.
- Always print InvestmentsAsOfDate when showing investment values. If stale or missing, flag it and avoid precise recommendations based on it.
`;
}

export function buildRothSection(config, cSym = "$", totalCheckingFloor = 0) {
  if (!isRothTrackingEnabled(config)) return "";

  return `State:
- Roth YTD Contributions: ${cSym}${Number.isFinite(config?.rothContributedYTD) ? config.rothContributedYTD.toFixed(2) : "0.00"}
- Roth Annual Limit: ${cSym}${Number.isFinite(config?.rothAnnualLimit) ? config.rothAnnualLimit.toFixed(2) : "0.00"}
- Objective: Maximize Roth contributions AFTER debt payoff priority is satisfied.

Debt-First Default:
- While revolving debt remains, default Roth weekly contribution to ${cSym}0.00 unless the user explicitly overrides.

Roth Activation Gate (automatic "turn-on"):
Roth contributions may begin only when ALL are true:
1) No listed credit-card balances exist OR only the subscriptions card has a balance that is being paid to ${cSym}0.00 weekly
2) All hard-deadline items in LIVE APP DATA (Sinking/One-Time + any min-pay) are on-pace
3) Checking end-of-audit projects ≥ ${cSym}${(config?.greenStatusTarget || 0).toFixed(2)} (soft target)

Contribution Sizing (do not guess IRS limit):
- AnnualRothLimit = user-provided in Settings or snapshot.
- Do not guess limits.
- RemainingToMax = AnnualRothLimit - RothYTD
- WeeklyRothTarget = RemainingToMax / PaychecksRemainingInYear
- Never fund Roth if it causes Checking < ${cSym}${totalCheckingFloor.toFixed(2)} or creates any hard-deadline shortfall.
`;
}

export function build401kSection(config, cSym = "$") {
  if (!is401kTrackingEnabled(config)) return "";

  return `
401k Tracking (if enabled):
- 401k Balance: ${cSym}${Number.isFinite(config?.k401Balance) ? config.k401Balance.toFixed(2) : "0.00"}
- 401k YTD Contributions: ${cSym}${Number.isFinite(config?.k401ContributedYTD) ? config.k401ContributedYTD.toFixed(2) : "0.00"}
- 401k Annual Limit: ${cSym}${Number.isFinite(config?.k401AnnualLimit) ? config.k401AnnualLimit.toFixed(2) : "0.00"}${
  config?.k401EmployerMatchPct > 0 || config?.k401EmployerMatchLimit > 0
    ? `
- Employer Match: ${config.k401EmployerMatchPct || 0}% on up to ${config.k401EmployerMatchLimit || 0}% of salary (vesting: ${config.k401VestingPct ?? 100}%)
- EMPLOYER MATCH RULE (HARD): capture the full match before discretionary debt acceleration unless minimums or floor protection are at risk.`
    : ""
}
`;
}

export function buildHSASection(config, cSym = "$") {
  if (!isHSATrackingEnabled(config)) return "";

  return `
HSA Tracking (if enabled):
- HSA Balance: ${cSym}${Number.isFinite(config?.hsaBalance) ? config.hsaBalance.toFixed(2) : "0.00"}
- HSA YTD Contributions: ${cSym}${Number.isFinite(config?.hsaContributedYTD) ? config.hsaContributedYTD.toFixed(2) : "0.00"}
- HSA Annual Limit: ${cSym}${Number.isFinite(config?.hsaAnnualLimit) ? config.hsaAnnualLimit.toFixed(2) : "4300.00"}
- HSA TRIPLE-TAX ADVANTAGE RULE (SOFT): after employer match, HSA usually beats Roth when medical exposure exists; mention that priority without turning it into a rigid requirement.
`;
}

export function buildWealthBuildingSection(config, _cSym = "$") {
  return `
========================
WEALTH BUILDING & TAX-ADVANTAGED LADDER
========================
- Default ladder: 401k match → HSA → Roth IRA → 401k → taxable brokerage unless cash-flow risk blocks it.
- Mention FSA deadlines, backdoor Roth, mega-backdoor Roth, or 529s only when clearly relevant.
- Short-term goals (<3 years) belong in cash-like vehicles, not equities.
- Never recommend new investing that breaks the checking floor, misses minimums, or ignores promo APR cliffs.
`;
}

export function buildExpandedCoverageLite(config, _cSym = "$") {
  const hasStudentDebt = (config?.nonCardDebts || []).some(d => String(d?.type || "").toLowerCase().includes("student"));
  const hasHousing = Number(config?.monthlyRent || 0) > 0 || Number(config?.mortgagePayment || 0) > 0 || Number(config?.homeEquity || 0) > 0;
  const hasDependents = Number(config?.dependents || 0) > 0;
  const is55Plus = config?.birthYear ? new Date().getFullYear() - config.birthYear >= 55 : false;

  return `
========================
CE) EXPANDED FINANCIAL SITUATION COVERAGE (CONCISE)
========================
Use only the scenarios that are relevant to the current snapshot or notes.

${hasHousing ? `MORTGAGE / RENT
- Housing is structural. Treat rent or mortgage as highest-priority fixed cost and flag >30% of gross income.
` : ""}${
    hasStudentDebt
      ? `STUDENT LOAN STRATEGIES
- Check PSLF / IDR tradeoffs before aggressive payoff of federal loans; private student debt follows normal prioritization.
`
      : ""
  }MEDICAL DEBT
- Push itemized bills, hardship plans, and provider negotiation before collections payoff.

ALIMONY / CHILD SUPPORT
- Treat any court-ordered support as non-deferrable and legal-risk-bearing.

${hasDependents ? `DEPENDENT / CHILDCARE EXPENSES
- Childcare/support costs are structural fixed costs; mention dependent-care FSA / education savings only when relevant.
` : ""}DEBT CONSOLIDATION / BALANCE TRANSFER
- Mention balance transfers or consolidation only when multiple high-APR debts exist, and warn about fees plus relapse risk.

${config?.birthYear && new Date().getFullYear() - config.birthYear >= 30 ? `ESTATE PLANNING / LIFE INSURANCE
- If the user is 30+ with dependents or meaningful assets, mention term life + basic estate documents.
` : ""}${
    is55Plus
      ? `PENSION / ANNUITY / SOCIAL SECURITY
- Treat pensions/annuities as guaranteed income; mention Social Security timing, RMDs, and Medicare only when age-relevant.
`
      : ""
  }RENTAL INCOME / REAL ESTATE
- Count only net rental income after property costs, and warn that real estate is illiquid.

EQUITY COMPENSATION (RSU/ESPP/STOCK OPTIONS)
- Track vesting or expiry dates, concentration risk, and tax-complexity warnings when employer stock is mentioned.
`;
}
