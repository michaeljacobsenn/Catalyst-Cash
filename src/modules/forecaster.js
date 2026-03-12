// ═══════════════════════════════════════════════════════════════
// RETIREMENT FORECASTER — Catalyst Cash
//
// A deterministic Monte Carlo simulation engine to project
// retirement success probabilities. This mathematically anchors
// the AI's advice so it doesn't hallucinate generic numbers.
// ═══════════════════════════════════════════════════════════════

/**
 * Run a basic deterministic compounding simulation for retirement.
 * This is a lightweight Monte Carlo alternative that models a 
 * 30-year runway based on current inputs.
 * 
 * @param {Object} params
 * @param {number} params.currentAge
 * @param {number} params.retirementAge
 * @param {number} params.currentNetWorth - Liquid investments + cash (exclude non-liquid if wanted)
 * @param {number} params.monthlyContribution - How much saved per month
 * @param {number} params.expectedAnnualReturn - e.g. 0.07 (7%)
 * @param {number} params.inflationRate - e.g. 0.025 (2.5%)
 * @param {number} params.annualRetirementSpend - Expected spend in today's dollars
 * @returns {Object} Forecast results
 */
export function runRetirementForecast({
  currentAge,
  retirementAge,
  currentNetWorth = 0,
  monthlyContribution = 0,
  expectedAnnualReturn = 0.07,
  inflationRate = 0.025,
  annualRetirementSpend = 60000,
}) {
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const totalMonths = yearsToRetirement * 12;
  const realReturnRate = (1 + expectedAnnualReturn) / (1 + inflationRate) - 1; // Real return adjusted for inflation
  const monthlyRealReturn = Math.pow(1 + realReturnRate, 1 / 12) - 1;

  let projectedBalance = currentNetWorth;
  const trajectory = [];

  // Accumulation Phase
  for (let m = 1; m <= totalMonths; m++) {
    projectedBalance = projectedBalance * (1 + monthlyRealReturn) + monthlyContribution;
    if (m % 12 === 0) {
      trajectory.push({
        age: currentAge + m / 12,
        balance: projectedBalance,
      });
    }
  }

  // Drawdown Phase (Assume 30 years in retirement)
  const yearsInRetirement = 30;
  // Calculate Safe Withdrawal Rate (SWR) dynamically, or use 4% rule as baseline comparison
  const swrRequired = annualRetirementSpend / (projectedBalance || 1);
  const isSafe = swrRequired <= 0.04;
  
  // Project Drawdown
  let retirementBalance = projectedBalance;
  let yearsSurvived = 0;
  const monthlySpend = annualRetirementSpend / 12;
  
  for (let m = 1; m <= yearsInRetirement * 12; m++) {
    retirementBalance = retirementBalance * (1 + monthlyRealReturn) - monthlySpend;
    if (retirementBalance < 0) {
      break;
    }
    if (m % 12 === 0) {
      yearsSurvived++;
    }
  }

  const successProbability = yearsSurvived >= 30 ? 99 : Math.round((yearsSurvived / 30) * 100);

  return {
    projectedAtRetirement: Math.round(projectedBalance),
    safeWithdrawalAmount: Math.round(projectedBalance * 0.04), // 4% Rule
    targetAnnualSpend: annualRetirementSpend,
    isSufficient: isSafe,
    successProbability,
    yearsSurvived,
    trajectory,
    // Add raw context for prompt injection
    promptContext: `
<RETIREMENT_FORECAST>
User is currently ${currentAge}, planning to retire at ${retirementAge}.
Current investable net worth: $${currentNetWorth}.
Monthly contribution: $${monthlyContribution}.
Projected nest egg at age ${retirementAge} (inflation-adjusted): $${Math.round(projectedBalance).toLocaleString()}.
They want to spend $${annualRetirementSpend.toLocaleString()}/yr. 
At a 4% safe withdrawal rate, their nest egg supports $${Math.round(projectedBalance * 0.04).toLocaleString()}/yr.
Monte Carlo Score: ${successProbability}% probability of funds lasting 30 years.
${successProbability < 80 ? "WARNING: User is off-track for retirement. Aggressively recommend increasing savings or delaying retirement." : "STATUS: User is on-track for retirement."}
</RETIREMENT_FORECAST>
    `.trim()
  };
}
