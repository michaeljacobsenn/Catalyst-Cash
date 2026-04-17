import type { Card } from "../../types/index.js";

export interface CreditUtilizationSummary {
  totalCreditBalance: number;
  totalCreditLimit: number;
  creditUtilization: number;
  gaugeUtilization: number;
}

export function computeCreditUtilizationSummary(cards: Card[] = []): CreditUtilizationSummary {
  let totalCreditBalance = 0;
  let totalCreditLimit = 0;

  for (const card of cards) {
    if (card?.cardType === "charge") continue;
    totalCreditBalance += Math.max(0, Number(card?._plaidBalance ?? card?.balance) || 0);
    totalCreditLimit += Math.max(0, Number(card?._plaidLimit ?? card?.limit) || 0);
  }

  const creditUtilization = totalCreditLimit > 0 ? (totalCreditBalance / totalCreditLimit) * 100 : 0;
  return {
    totalCreditBalance,
    totalCreditLimit,
    creditUtilization,
    gaugeUtilization: Math.max(0, Math.min(creditUtilization, 100)),
  };
}
