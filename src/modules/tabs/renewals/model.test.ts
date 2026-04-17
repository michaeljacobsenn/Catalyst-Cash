import { describe, expect, it } from "vitest";

import {
  buildGroupedRenewalItems,
  buildRenewalGroups,
  calculateMonthlyRenewalTotal,
  countActiveRenewalItems,
  countInactiveRenewalItems,
  createEmptyRenewalFormState,
  isInactiveRenewal,
} from "./model";

const categoryMeta = {
  housing: { label: "Housing & Utilities", color: "#f00" },
  subs: { label: "Subscriptions", color: "#00f" },
  insurance: { label: "Insurance", color: "#fa0" },
  transport: { label: "Transportation", color: "#0af" },
  essentials: { label: "Groceries & Essentials", color: "#0f0" },
  medical: { label: "Medical & Health", color: "#0aa" },
  sinking: { label: "Sinking Funds", color: "#a0f" },
  onetime: { label: "One-Time Expenses", color: "#ff0" },
  inactive: { label: "Inactive & History", color: "#999" },
  fixed: { label: "Housing & Utilities", color: "#f00" },
  monthly: { label: "Housing & Utilities", color: "#f00" },
  cadence: { label: "Subscriptions", color: "#00f" },
  periodic: { label: "Subscriptions", color: "#00f" },
  af: { label: "Annual Fees", color: "#b86" },
};

describe("renewals model", () => {
  it("creates a reusable empty renewal draft state", () => {
    expect(createEmptyRenewalFormState()).toEqual({
      name: "",
      amount: "",
      interval: 1,
      intervalUnit: "months",
      source: "",
      chargedTo: "",
      chargedToId: "",
      chargedToType: "",
      category: "subs",
      nextDue: "",
    });
  });

  it("merges annual fees without duplicating linked renewals and marks expired items", () => {
    const items = buildGroupedRenewalItems(
      [
        {
          name: "Chase Sapphire Annual Fee",
          linkedCardId: "card_1",
          amount: 95,
          interval: 1,
          intervalUnit: "years",
          category: "subs",
        },
        {
          name: "Concert Ticket",
          amount: 120,
          interval: 1,
          intervalUnit: "one-time",
          nextDue: "2026-03-01",
          category: "onetime",
        },
      ] as never[],
      [
        {
          name: "Chase Sapphire Annual Fee",
          cardName: "Chase Sapphire",
          linkedCardId: "card_1",
          amount: 95,
          interval: 1,
          intervalUnit: "years",
        },
        {
          name: "Amex Gold Annual Fee",
          cardName: "Amex Gold",
          linkedCardId: "card_2",
          amount: 325,
          interval: 1,
          intervalUnit: "years",
        },
      ] as never[],
      "2026-04-16"
    );

    expect(items).toHaveLength(3);
    expect(items.filter((item) => item.linkedCardId === "card_1")).toHaveLength(1);
    expect(items.find((item) => item.name === "Concert Ticket")?.isExpired).toBe(true);
  });

  it("hides inactive renewals by default and shows them when toggled on", () => {
    const items = [
      {
        name: "Netflix",
        amount: 20,
        interval: 1,
        intervalUnit: "months",
        category: "subs",
      },
      {
        name: "Old Gym",
        amount: 50,
        interval: 1,
        intervalUnit: "months",
        category: "subs",
        isCancelled: true,
      },
    ];

    const hiddenInactive = buildRenewalGroups(items as never[], {
      sortBy: "type",
      showInactive: false,
      categoryMeta,
    });
    const visibleInactive = buildRenewalGroups(items as never[], {
      sortBy: "type",
      showInactive: true,
      categoryMeta,
    });

    expect(hiddenInactive.some((group) => group.id === "inactive")).toBe(false);
    expect(hiddenInactive[0]?.items).toHaveLength(1);
    expect(visibleInactive.find((group) => group.id === "inactive")?.items).toHaveLength(1);
  });

  it("counts and normalizes active monthly cost using the same inactive rules as the UI", () => {
    const items = [
      {
        name: "Netflix",
        amount: 15,
        interval: 1,
        intervalUnit: "months",
      },
      {
        name: "Weekly Parking",
        amount: 20,
        interval: 1,
        intervalUnit: "weeks",
      },
      {
        name: "Dormant Entry",
        amount: 100,
        interval: 0,
        intervalUnit: "months",
      },
      {
        name: "Cancelled Service",
        amount: 25,
        interval: 1,
        intervalUnit: "months",
        isCancelled: true,
      },
    ];

    expect(countActiveRenewalItems(items as never[])).toBe(2);
    expect(countInactiveRenewalItems(items as never[])).toBe(2);
    expect(isInactiveRenewal(items[2] as never)).toBe(true);
    expect(calculateMonthlyRenewalTotal(items as never[])).toBeCloseTo(101.6, 1);
  });

  it("keeps inactive items hidden even in alternate sort modes unless explicitly requested", () => {
    const items = [
      {
        name: "Netflix",
        amount: 20,
        interval: 1,
        intervalUnit: "months",
      },
      {
        name: "Archived Item",
        amount: 10,
        interval: 1,
        intervalUnit: "months",
        archivedAt: "2026-04-01",
      },
    ];

    const hidden = buildRenewalGroups(items as never[], {
      sortBy: "amount",
      showInactive: false,
      categoryMeta,
    });
    const shown = buildRenewalGroups(items as never[], {
      sortBy: "amount",
      showInactive: true,
      categoryMeta,
    });

    expect(hidden[0]?.items).toHaveLength(1);
    expect(shown[0]?.items).toHaveLength(2);
  });
});
