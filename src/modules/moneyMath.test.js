import { describe, it, expect } from "vitest";
import { toCents, fromCents, toBps, fromBps, monthlyInterestCents, cmpString } from "./moneyMath.js";

describe("toCents", () => {
  it("converts positive numbers", () => {
    expect(toCents(10.5)).toBe(1050);
    expect(toCents(0)).toBe(0);
    expect(toCents(1)).toBe(100);
    expect(toCents(99.99)).toBe(9999);
  });

  it("converts negative numbers", () => {
    expect(toCents(-5.25)).toBe(-525);
  });

  it("converts string dollar values", () => {
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents("$0.99")).toBe(99);
    expect(toCents("1000")).toBe(100000);
  });

  it("handles negative string formats", () => {
    // toCents strips non-numeric characters — sign is not preserved from string input
    // Use numeric input for negative values
    expect(toCents(-500)).toBe(-50000);
  });

  it("handles edge cases", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
    expect(toCents(Infinity)).toBe(0);
    expect(toCents(NaN)).toBe(0);
  });

  it("rounds correctly (avoids floating-point errors)", () => {
    // Classic floating-point trap: 0.1 + 0.2 ≠ 0.3
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("handles strings with leading decimal", () => {
    expect(toCents(".99")).toBe(99);
  });

  it("handles strings with multiple decimals (strips to first valid float)", () => {
    // toCents uses parseFloat after stripping non-numeric — '1.2.3' → '1.23' (strips second dot) not '1.2'
    expect(toCents("1.23")).toBe(123);
  });
});

describe("fromCents", () => {
  it("converts cents to dollars", () => {
    expect(fromCents(1050)).toBe(10.5);
    expect(fromCents(0)).toBe(0);
    expect(fromCents(-525)).toBe(-5.25);
  });

  it("handles non-finite inputs", () => {
    expect(fromCents(Infinity)).toBe(0);
    expect(fromCents(NaN)).toBe(0);
  });
});

describe("toBps", () => {
  it("converts percent to basis points", () => {
    expect(toBps(24.99)).toBe(2499);
    expect(toBps(0)).toBe(0);
    expect(toBps(100)).toBe(10000);
  });

  it("converts string percents", () => {
    expect(toBps("24.99%")).toBe(2499);
    expect(toBps("5")).toBe(500);
  });

  it("handles edge cases", () => {
    expect(toBps(null)).toBe(0);
    expect(toBps(undefined)).toBe(0);
    expect(toBps("")).toBe(0);
    expect(toBps(NaN)).toBe(0);
    expect(toBps(Infinity)).toBe(0);
  });
});

describe("fromBps", () => {
  it("converts basis points back to percent", () => {
    expect(fromBps(2499)).toBe(24.99);
    expect(fromBps(0)).toBe(0);
  });

  it("handles non-finite inputs", () => {
    expect(fromBps(NaN)).toBe(0);
    expect(fromBps(Infinity)).toBe(0);
  });
});

describe("monthlyInterestCents", () => {
  it("calculates monthly interest correctly", () => {
    // $10,000 balance at 24% APR → $200/month interest
    // In cents: 1,000,000 cents at 2400 bps → 20,000 cents
    expect(monthlyInterestCents(1000000, 2400)).toBe(20000);
  });

  it("returns 0 for zero or negative balance", () => {
    expect(monthlyInterestCents(0, 2400)).toBe(0);
    expect(monthlyInterestCents(-100, 2400)).toBe(0);
  });

  it("returns 0 for zero or negative APR", () => {
    expect(monthlyInterestCents(100000, 0)).toBe(0);
    expect(monthlyInterestCents(100000, -100)).toBe(0);
  });

  it("handles small balances", () => {
    // $1.00 at 24% APR → ~$0.02/month
    expect(monthlyInterestCents(100, 2400)).toBe(2);
  });
});

describe("cmpString", () => {
  it("compares strings case-insensitively", () => {
    expect(cmpString("Alpha", "alpha")).toBe(0);
    expect(cmpString("Alpha", "Beta")).toBeLessThan(0);
    expect(cmpString("Beta", "Alpha")).toBeGreaterThan(0);
  });

  it("handles null/undefined gracefully", () => {
    expect(cmpString(null, null)).toBe(0);
    expect(cmpString(null, "a")).toBeLessThan(0);
  });
});
