// ═══════════════════════════════════════════════════════════════
// VALIDATION — Input validation for financial data
// Catches impossible values before they reach engine.js or the AI prompt.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ValidationError
 * @property {string} field - Field name that failed validation
 * @property {string} message - Human-readable error message
 * @property {'error'|'warning'} severity - Error blocks submission, warning is advisory
 */

/**
 * Validate the financial snapshot form data before audit submission.
 * @param {Object} formData - The form data from InputForm
 * @param {Object} [financialConfig] - User's financial configuration
 * @returns {{ valid: boolean, errors: ValidationError[] }}
 */
export function validateSnapshot(formData, _financialConfig = {}) {
  const errors = [];

  // ── Date validation ──
  if (!formData?.date) {
    errors.push({ field: "date", message: "Snapshot date is required", severity: "error" });
  } else {
    const d = new Date(formData.date);
    if (isNaN(d.getTime())) {
      errors.push({ field: "date", message: "Invalid date format", severity: "error" });
    }
    const now = new Date();
    now.setDate(now.getDate() + 1); // Allow today
    if (d > now) {
      errors.push({ field: "date", message: "Snapshot date cannot be in the future", severity: "warning" });
    }
  }

  // ── Checking balance validation ──
  const checking = parseFloat(formData?.checking);
  if (formData?.checking !== undefined && formData.checking !== "") {
    if (isNaN(checking)) {
      errors.push({ field: "checking", message: "Checking balance must be a number", severity: "error" });
    } else if (checking < -100000) {
      errors.push({ field: "checking", message: "Checking balance seems unusually low", severity: "warning" });
    } else if (checking > 10000000) {
      errors.push({ field: "checking", message: "Checking balance seems unusually high", severity: "warning" });
    }
  }

  // ── Savings validation ──
  const savings = parseFloat(formData?.savings || formData?.ally);
  if (savings !== undefined && !isNaN(savings)) {
    if (savings < 0) {
      errors.push({ field: "savings", message: "Savings cannot be negative", severity: "error" });
    }
  }

  // ── Debt validation ──
  if (Array.isArray(formData?.debts)) {
    formData.debts.forEach((debt, i) => {
      const balance = parseFloat(debt.balance);
      const apr = parseFloat(debt.apr);
      const minPayment = parseFloat(debt.minPayment);
      const limit = parseFloat(debt.limit);

      if (!isNaN(balance) && balance < 0) {
        errors.push({
          field: `debts[${i}].balance`,
          message: `${debt.name || `Debt ${i + 1}`}: Balance cannot be negative`,
          severity: "error",
        });
      }

      if (!isNaN(apr)) {
        if (apr < 0) {
          errors.push({
            field: `debts[${i}].apr`,
            message: `${debt.name || `Debt ${i + 1}`}: APR cannot be negative`,
            severity: "error",
          });
        } else if (apr > 100) {
          errors.push({
            field: `debts[${i}].apr`,
            message: `${debt.name || `Debt ${i + 1}`}: APR over 100% seems incorrect`,
            severity: "warning",
          });
        }
      }

      if (!isNaN(minPayment) && minPayment < 0) {
        errors.push({
          field: `debts[${i}].minPayment`,
          message: `${debt.name || `Debt ${i + 1}`}: Minimum payment cannot be negative`,
          severity: "error",
        });
      }

      if (!isNaN(limit) && !isNaN(balance) && balance > limit && limit > 0) {
        errors.push({
          field: `debts[${i}].balance`,
          message: `${debt.name || `Debt ${i + 1}`}: Balance exceeds credit limit`,
          severity: "warning",
        });
      }
    });
  }

  return {
    valid: errors.filter(e => e.severity === "error").length === 0,
    errors,
  };
}

/**
 * Validate a credit card entry before adding to portfolio.
 * @param {Object} card - Card data
 * @returns {{ valid: boolean, errors: ValidationError[] }}
 */
export function validateCard(card) {
  const errors = [];

  if (!card?.name?.trim() && !card?.nickname?.trim()) {
    errors.push({ field: "name", message: "Card name is required", severity: "error" });
  }

  const limit = parseFloat(card?.limit);
  if (!isNaN(limit) && limit < 0) {
    errors.push({ field: "limit", message: "Credit limit cannot be negative", severity: "error" });
  }

  const apr = parseFloat(card?.apr);
  if (!isNaN(apr) && (apr < 0 || apr > 100)) {
    errors.push({ field: "apr", message: "APR must be between 0% and 100%", severity: "error" });
  }

  const annualFee = parseFloat(card?.annualFee);
  if (!isNaN(annualFee) && annualFee < 0) {
    errors.push({ field: "annualFee", message: "Annual fee cannot be negative", severity: "error" });
  }

  return {
    valid: errors.filter(e => e.severity === "error").length === 0,
    errors,
  };
}

/**
 * Validate a renewal/subscription entry.
 * @param {Object} renewal - Renewal data
 * @returns {{ valid: boolean, errors: ValidationError[] }}
 */
export function validateRenewal(renewal) {
  const errors = [];

  if (!renewal?.name?.trim()) {
    errors.push({ field: "name", message: "Expense name is required", severity: "error" });
  }

  const amount = parseFloat(renewal?.amount);
  if (isNaN(amount) || amount <= 0) {
    errors.push({ field: "amount", message: "Amount must be a positive number", severity: "error" });
  }

  if (!renewal?.intervalUnit) {
    errors.push({ field: "intervalUnit", message: "Billing interval is required", severity: "error" });
  }

  return {
    valid: errors.filter(e => e.severity === "error").length === 0,
    errors,
  };
}
