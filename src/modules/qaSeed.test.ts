import { describe,expect,it } from "vitest";

import {
  FULL_PROFILE_QA_BANKS,
  FULL_PROFILE_QA_CARDS,
  FULL_PROFILE_QA_RENEWALS,
  shouldRecoverFromFullProfileQaSeed,
  stripFullProfileQaRecords,
} from "./qaSeed.js";

describe("qaSeed recovery helpers", () => {
  it("strips seeded QA records while preserving unrelated data", () => {
    const result = stripFullProfileQaRecords({
      cards: [...FULL_PROFILE_QA_CARDS, { id: "real-card", name: "Real Card", institution: "Chase" } as any],
      bankAccounts: [...FULL_PROFILE_QA_BANKS, { id: "real-bank", name: "Operating", bank: "Chase" } as any],
      renewals: [...FULL_PROFILE_QA_RENEWALS, { id: "real-renewal", name: "Internet", amount: 80 } as any],
    });

    expect(result.cards).toEqual([{ id: "real-card", name: "Real Card", institution: "Chase" }]);
    expect(result.bankAccounts).toEqual([{ id: "real-bank", name: "Operating", bank: "Chase" }]);
    expect(result.renewals).toEqual([{ id: "real-renewal", name: "Internet", amount: 80 }]);
    expect(result.removedCardCount).toBe(FULL_PROFILE_QA_CARDS.length);
    expect(result.removedBankAccountCount).toBe(FULL_PROFILE_QA_BANKS.length);
    expect(result.removedRenewalCount).toBe(FULL_PROFILE_QA_RENEWALS.length);
  });

  it("recommends recovery only when linked banks exist and no local Plaid-linked accounts are mounted", () => {
    expect(
      shouldRecoverFromFullProfileQaSeed({
        cards: FULL_PROFILE_QA_CARDS,
        bankAccounts: FULL_PROFILE_QA_BANKS,
        renewals: FULL_PROFILE_QA_RENEWALS,
        plaidConnections: [{ id: "conn_1" }],
      })
    ).toBe(true);

    expect(
      shouldRecoverFromFullProfileQaSeed({
        cards: [{ ...FULL_PROFILE_QA_CARDS[0], _plaidAccountId: "acct_1" }] as any,
        bankAccounts: FULL_PROFILE_QA_BANKS,
        renewals: FULL_PROFILE_QA_RENEWALS,
        plaidConnections: [{ id: "conn_1" }],
      })
    ).toBe(false);

    expect(
      shouldRecoverFromFullProfileQaSeed({
        cards: FULL_PROFILE_QA_CARDS,
        bankAccounts: FULL_PROFILE_QA_BANKS,
        renewals: FULL_PROFILE_QA_RENEWALS,
        plaidConnections: [],
      })
    ).toBe(false);
  });
});
