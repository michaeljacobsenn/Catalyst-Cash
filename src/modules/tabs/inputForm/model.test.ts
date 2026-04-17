import { describe, expect, it } from "vitest";

import {
  buildAuditSubmitFormState,
  buildLiveDebtBalanceLookup,
  buildAuditCashAccountSnapshot,
  buildCashAccountMeta,
  buildInvestmentAuditFields,
  buildInvestmentAuditSources,
  buildResolvedInvestmentSnapshot,
  filterCashAccountMeta,
  getEffectiveDebtTotal,
  getEffectiveCashAccountTotal,
  getEffectiveInvestmentFieldValue,
  splitInvestmentAuditSources,
  splitInvestmentAuditFields,
  type InputFormState,
  type InvestmentAuditField,
} from "./model";

function createForm(overrides: Partial<InputFormState> = {}): InputFormState {
  return {
    date: "2026-04-16",
    time: "09:30",
    checking: "",
    savings: "",
    roth: "",
    brokerage: "",
    k401Balance: "",
    pendingCharges: [],
    habitCount: 0,
    debts: [],
    notes: "",
    autoPaycheckAdd: false,
    paycheckAddOverride: "",
    ...overrides,
  };
}

describe("input form model helpers", () => {
  it("buildCashAccountMeta groups matching accounts and prefers live plaid amounts", () => {
    const meta = buildCashAccountMeta(
      [
        {
          id: "checking-1",
          accountType: "checking",
          bank: "Chase",
          name: "Total Checking",
          balance: 400,
          _plaidAvailable: 550,
        },
        {
          id: "checking-2",
          accountType: "checking",
          bank: "Fidelity",
          name: "Cash Management",
          _plaidBalance: 1200,
        },
        {
          id: "savings-1",
          accountType: "savings",
          bank: "Marcus",
          name: "High Yield",
          balance: 3000,
        },
      ] as any[],
      "checking",
      "Checking"
    );

    expect(meta.count).toBe(2);
    expect(meta.label).toBe("Checking (2)");
    expect(meta.total).toBe(1750);
    expect(meta.accounts).toEqual([
      expect.objectContaining({
        id: "checking-1",
        amount: 550,
        displayLabel: "Chase · Total Checking",
      }),
      expect.objectContaining({
        id: "checking-2",
        amount: 1200,
        displayLabel: "Fidelity · Cash Management",
      }),
    ]);
  });

  it("filterCashAccountMeta removes deleted accounts and updates the aggregate label", () => {
    const meta = buildCashAccountMeta(
      [
        {
          id: "checking-1",
          accountType: "checking",
          bank: "Chase",
          name: "Total Checking",
          balance: 500,
        },
        {
          id: "checking-2",
          accountType: "checking",
          bank: "SoFi",
          name: "Everyday",
          balance: 700,
        },
      ] as any[],
      "checking",
      "Checking"
    );

    const filtered = filterCashAccountMeta(meta, "Checking", { "checking-2": true });

    expect(filtered.count).toBe(1);
    expect(filtered.label).toBe("Total Checking");
    expect(filtered.total).toBe(500);
    expect(filtered.accounts.map((account) => account.id)).toEqual(["checking-1"]);
  });

  it("getEffectiveCashAccountTotal applies per-account overrides without losing untouched balances", () => {
    const meta = buildCashAccountMeta(
      [
        {
          id: "checking-1",
          accountType: "checking",
          bank: "Chase",
          name: "Total Checking",
          balance: 500,
        },
        {
          id: "checking-2",
          accountType: "checking",
          bank: "SoFi",
          name: "Everyday",
          balance: 700,
        },
      ] as any[],
      "checking",
      "Checking"
    );

    expect(getEffectiveCashAccountTotal(meta, { "checking-2": "950" })).toBe(1450);
  });

  it("getEffectiveInvestmentFieldValue prefers auto values unless the field is overridden", () => {
    const baseField: InvestmentAuditField = {
      key: "brokerage",
      label: "Brokerage",
      enabled: true,
      accent: "#10B981",
      autoValue: 4200,
      formValue: "1200",
      override: false,
    };
    const form = createForm({ brokerage: "1200" });

    expect(getEffectiveInvestmentFieldValue(baseField, form)).toBe(4200);
    expect(getEffectiveInvestmentFieldValue({ ...baseField, override: true }, form)).toBe(1200);
    expect(getEffectiveInvestmentFieldValue({ ...baseField, autoValue: 0 }, form)).toBe(1200);
  });

  it("buildLiveDebtBalanceLookup indexes plaid balances by card id", () => {
    const lookup = buildLiveDebtBalanceLookup([
      { cardId: "card-1", name: "Visa", balance: 250 },
      { cardId: "card-2", name: "Amex", balance: "410.55" },
      { cardId: "", name: "Ignored", balance: 999 },
    ]);

    expect(Array.from(lookup.entries())).toEqual([
      ["card-1", 250],
      ["card-2", 410.55],
    ]);
  });

  it("getEffectiveDebtTotal uses live balances unless a debt row is manually overridden", () => {
    const liveLookup = buildLiveDebtBalanceLookup([
      { cardId: "card-1", name: "Visa", balance: 250 },
      { cardId: "card-2", name: "Amex", balance: 410.55 },
    ]);

    const total = getEffectiveDebtTotal(
      [
        { cardId: "card-1", name: "Visa", balance: "900" },
        { cardId: "card-2", name: "Amex", balance: "500" },
        { cardId: "", name: "Manual", balance: "80" },
      ],
      liveLookup,
      { "card-2": true }
    );

    expect(total).toBe(830);
  });

  it("buildResolvedInvestmentSnapshot keeps only visible resolved balances", () => {
    const visibleInvestmentFields: InvestmentAuditField[] = [
      {
        key: "roth",
        label: "Roth IRA",
        enabled: true,
        accent: "#8B5CF6",
        autoValue: 2500,
        formValue: "1000",
        override: false,
      },
      {
        key: "k401",
        label: "401(k)",
        enabled: true,
        accent: "#3B82F6",
        autoValue: 0,
        formValue: "7800.567",
        override: true,
      },
    ];

    const snapshot = buildResolvedInvestmentSnapshot({
      visibleInvestmentFields,
      form: createForm({ roth: "1000", k401Balance: "7800.567" }),
    });

    expect(snapshot).toEqual({
      roth: 2500,
      brokerage: "",
      k401Balance: 7800.57,
    });
  });

  it("buildInvestmentAuditFields derives enabled investment rows from tracking config and overrides", () => {
    const fields = buildInvestmentAuditFields({
      trackingConfig: {
        trackRoth: true,
        trackBrokerage: false,
        track401k: true,
      },
      autoValues: {
        roth: 2500,
        brokerage: 0,
        k401: 7800,
      },
      form: createForm({
        roth: "1000",
        brokerage: "1200",
        k401Balance: "7600",
      }),
      overrides: {
        roth: false,
        brokerage: true,
        k401: false,
      },
    });

    expect(fields).toEqual([
      expect.objectContaining({ key: "roth", enabled: true, autoValue: 2500, override: false }),
      expect.objectContaining({ key: "brokerage", enabled: false, override: true }),
      expect.objectContaining({ key: "k401", enabled: true, autoValue: 7800, override: false }),
    ]);
  });

  it("splitInvestmentAuditFields keeps overridden or non-empty rows visible and hides deleted rows", () => {
    const fields: InvestmentAuditField[] = [
      {
        key: "roth",
        label: "Roth IRA",
        enabled: true,
        accent: "#8B5CF6",
        autoValue: 2500,
        formValue: "",
        override: false,
      },
      {
        key: "brokerage",
        label: "Brokerage",
        enabled: true,
        accent: "#10B981",
        autoValue: 0,
        formValue: "1400",
        override: false,
      },
      {
        key: "k401",
        label: "401(k)",
        enabled: true,
        accent: "#3B82F6",
        autoValue: 0,
        formValue: "",
        override: false,
      },
    ];

    const { visibleFields, hiddenFields } = splitInvestmentAuditFields(fields, { roth: true });

    expect(visibleFields.map((field) => field.key)).toEqual(["brokerage"]);
    expect(hiddenFields.map((field) => field.key)).toEqual(["roth", "k401"]);
  });

  it("buildAuditCashAccountSnapshot flattens visible checking and savings accounts for submit payloads", () => {
    const checkingMeta = buildCashAccountMeta(
      [
        {
          id: "checking-1",
          accountType: "checking",
          bank: "Chase",
          name: "Total Checking",
          balance: 500,
        },
      ] as any[],
      "checking",
      "Checking"
    );
    const savingsMeta = buildCashAccountMeta(
      [
        {
          id: "savings-1",
          accountType: "savings",
          bank: "Marcus",
          name: "HYSA",
          balance: 2500,
        },
      ] as any[],
      "savings",
      "Savings"
    );

    expect(buildAuditCashAccountSnapshot(checkingMeta, savingsMeta)).toEqual([
      {
        id: "checking-1",
        bank: "Chase",
        name: "Total Checking",
        accountType: "checking",
        amount: "500.00",
        source: "live",
      },
      {
        id: "savings-1",
        bank: "Marcus",
        name: "HYSA",
        accountType: "savings",
        amount: "2500.00",
        source: "live",
      },
    ]);
  });

  it("buildAuditSubmitFormState applies visible investment and cash overrides to the submit snapshot", () => {
    const checkingMeta = buildCashAccountMeta(
      [
        {
          id: "checking-1",
          accountType: "checking",
          bank: "Chase",
          name: "Total Checking",
          balance: 500,
        },
      ] as any[],
      "checking",
      "Checking"
    );
    const savingsMeta = buildCashAccountMeta(
      [
        {
          id: "savings-1",
          accountType: "savings",
          bank: "Marcus",
          name: "HYSA",
          balance: 2500,
        },
      ] as any[],
      "savings",
      "Savings"
    );

    const submitState = buildAuditSubmitFormState({
      form: createForm({
        checking: "400",
        savings: "2500",
        roth: "1000",
        brokerage: "",
        k401Balance: "8000",
      }),
      visibleInvestmentSources: [
        {
          id: "plaid:roth-account",
          bucket: "roth",
          label: "Roth IRA",
          accent: "#8B5CF6",
          amount: 2500,
          detail: "Vanguard · linked account",
          sourceType: "plaid-account",
          editable: false,
        },
        {
          id: "manual-balance:k401",
          bucket: "k401",
          label: "401(k)",
          accent: "#3B82F6",
          amount: 8000,
          detail: "Manual balance",
          sourceType: "manual-balance",
          editable: true,
          formKey: "k401Balance",
        },
      ],
      effectiveCheckingTotal: 600,
      effectiveSavingsTotal: 2500,
      checkingAccountMeta: checkingMeta,
      savingsAccountMeta: savingsMeta,
      visibleCheckingAccountMeta: checkingMeta,
      visibleSavingsAccountMeta: savingsMeta,
      cashAccountOverrides: { "checking-1": "600" },
      checkingOverrideActive: true,
      savingsOverrideActive: false,
      hiddenCheckingCount: 0,
      hiddenSavingsCount: 1,
      currentTime: "08:45",
    });

    expect(submitState).toMatchObject({
      checking: 600,
      savings: 2500,
      roth: 2500,
      brokerage: "",
      k401Balance: 8000,
      includedInvestmentKeys: ["roth", "k401"],
      investmentSnapshot: {
        roth: 2500,
        brokerage: "",
        k401Balance: 8000,
      },
      cashSummary: {
        checkingTotalUsed: 600,
        savingsTotalUsed: 2500,
        linkedCheckingTotal: 500,
        linkedSavingsTotal: 2500,
        checkingOverride: true,
        savingsOverride: true,
      },
      paycheckAddOverride: "",
      time: "08:45",
    });
    expect(submitState.cashAccounts).toEqual([
      {
        id: "checking-1",
        bank: "Chase",
        name: "Total Checking",
        accountType: "checking",
        amount: "600.00",
        source: "live",
        overridden: true,
      },
      {
        id: "savings-1",
        bank: "Marcus",
        name: "HYSA",
        accountType: "savings",
        amount: "2500.00",
        source: "live",
      },
    ]);
  });

  it("buildInvestmentAuditSources keeps plaid and manual investment sources distinct within the same bucket", () => {
    const sources = buildInvestmentAuditSources({
      trackingConfig: {
        trackBrokerage: true,
        enableHoldings: true,
      },
      holdingValues: {
        roth: 0,
        brokerage: 4200,
        k401: 0,
      },
      form: createForm({
        brokerage: "",
      }),
      holdings: {
        brokerage: [{ symbol: "VTI" }, { symbol: "VXUS" }],
      },
      plaidInvestments: [
        {
          id: "brokerage-linked",
          bucket: "brokerage",
          institution: "Fidelity",
          name: "Taxable Brokerage",
          _plaidBalance: 7600,
        },
      ],
    });

    const { visibleSources, hiddenSources } = splitInvestmentAuditSources(sources, {});

    expect(visibleSources.map((source) => source.id)).toEqual([
      "manual-holdings:brokerage",
      "plaid:brokerage-linked",
    ]);
    expect(hiddenSources.map((source) => source.id)).toContain("manual-balance:brokerage");
  });
});
