import { describe, expect, it } from "vitest";
import { isSafeImportKey, isSecuritySensitiveKey, sanitizePlaidForBackup } from "./securityKeys.js";

describe("security key guards", () => {
  it("treats secure-storage aliases and entitlement metadata as sensitive", () => {
    expect(isSecuritySensitiveKey("app-passcode")).toBe(true);
    expect(isSecuritySensitiveKey("secure:app-passcode")).toBe(true);
    expect(isSecuritySensitiveKey("subscription-state")).toBe(true);
    expect(isSecuritySensitiveKey("device-id")).toBe(true);
    expect(isSecuritySensitiveKey("api-key-openai")).toBe(true);
  });

  it("treats Plaid data as sensitive (PII protection)", () => {
    expect(isSecuritySensitiveKey("plaid-connections")).toBe(true);
    expect(isSecuritySensitiveKey("plaid-transactions")).toBe(true);
  });

  it("only allows safe non-sensitive import keys", () => {
    expect(isSafeImportKey("financial-config")).toBe(true);
    expect(isSafeImportKey("secure:app-passcode")).toBe(false);
    expect(isSafeImportKey("subscription-state")).toBe(false);
    expect(isSafeImportKey("Device-ID")).toBe(false);
    expect(isSafeImportKey("plaid-connections")).toBe(false);
    expect(isSafeImportKey("plaid-transactions")).toBe(false);
  });
});

describe("sanitizePlaidForBackup", () => {
  it("strips access tokens and sets _needsReconnect", () => {
    const raw = [{
      id: "item-1",
      institutionName: "Chase",
      institutionId: "ins_3",
      accessToken: "access-sandbox-secret-123",
      accounts: [{
        plaidAccountId: "acct-1",
        name: "Checking",
        officialName: "CHASE TOTAL CHECKING",
        type: "depository",
        subtype: "checking",
        mask: "1234",
        linkedCardId: null,
        linkedBankAccountId: "bank-1",
        balance: { current: 5000, available: 4800 },
      }],
      lastSync: "2026-03-01T00:00:00.000Z",
    }];

    const sanitized = sanitizePlaidForBackup(raw);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].accessToken).toBeUndefined();
    expect(sanitized[0]._needsReconnect).toBe(true);
    expect(sanitized[0].lastSync).toBeNull();
    expect(sanitized[0].institutionName).toBe("Chase");
    expect(sanitized[0].institutionId).toBe("ins_3");
    expect(sanitized[0].accounts[0].linkedBankAccountId).toBe("bank-1");
    expect(sanitized[0].accounts[0].mask).toBe("1234");
    expect(sanitized[0].accounts[0].balance).toBeNull();
  });

  it("returns empty array for empty/undefined input", () => {
    expect(sanitizePlaidForBackup([])).toEqual([]);
    expect(sanitizePlaidForBackup(undefined)).toEqual([]);
    expect(sanitizePlaidForBackup(null)).toEqual([]);
  });

  it("preserves linked card/bank/investment IDs", () => {
    const raw = [{
      id: "item-2",
      institutionName: "Amex",
      institutionId: "ins_7",
      accessToken: "access-sandbox-xyz",
      accounts: [{
        plaidAccountId: "acct-2",
        name: "Gold Card",
        officialName: "Amex Gold Card",
        type: "credit",
        subtype: "credit card",
        mask: "0042",
        linkedCardId: "card-abc",
        linkedBankAccountId: null,
        linkedInvestmentId: null,
        balance: { current: 1200 },
      }],
    }];

    const sanitized = sanitizePlaidForBackup(raw);
    expect(sanitized[0].accounts[0].linkedCardId).toBe("card-abc");
    expect(sanitized[0].accounts[0].plaidAccountId).toBe("acct-2");
  });
});
