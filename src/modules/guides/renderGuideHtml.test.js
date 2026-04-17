import { describe, expect, it } from "vitest";

import { renderGuideHtml } from "./renderGuideHtml.js";

describe("renderGuideHtml", () => {
  it("renders the free guide with current limits and upgrade CTA", () => {
    const html = renderGuideHtml("free");

    expect(html).toContain("2 audits / week");
    expect(html).toContain("5 AskAI / day");
    expect(html).toContain("1 Plaid institution");
    expect(html).toContain("See what Pro unlocks");
    expect(html).toContain("Catalyst AI");
    expect(html).toContain("Set up the smallest honest version of your finances");
  });

  it("renders the pro guide with current limits and pricing", () => {
    const html = renderGuideHtml("pro");

    expect(html).toContain("20 audits / month");
    expect(html).toContain("30 AskAI / day");
    expect(html).toContain("Up to 8 Plaid institutions");
    expect(html).toContain("$109.99/yr");
    expect(html).toContain("Catalyst AI CFO + Boardroom");
    expect(html).toContain("Run Pro like an operator");
  });
});
