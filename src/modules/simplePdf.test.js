import { describe, expect, it } from "vitest";

import { SimplePdfDocument } from "./simplePdf.js";

describe("SimplePdfDocument", () => {
  it("builds a valid multi-page PDF with built-in fonts", () => {
    const pdf = new SimplePdfDocument();

    pdf.drawRoundedRect(40, 40, 200, 60, 10, {
      fillColor: [249, 250, 251],
      borderColor: [229, 231, 235],
    });
    pdf.drawText("Catalyst Cash", 54, 62, {
      font: "bold",
      size: 18,
      color: [17, 24, 39],
    });
    pdf.drawLine(40, 120, 300, 120, {
      color: [229, 231, 235],
    });
    pdf.addPage();
    pdf.drawText(pdf.splitTextToSize("Second page content goes here.", 220, { size: 12 }), 40, 60, {
      size: 12,
      color: [55, 65, 81],
    });

    const text = Buffer.from(pdf.toBase64(), "base64").toString("utf8");

    expect(text).toContain("%PDF-1.4");
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Count 2");
    expect(text).toContain("/Helvetica-Bold");
  });

  it("normalizes accented latin text instead of dropping it entirely", () => {
    const pdf = new SimplePdfDocument();

    pdf.drawText("José pays déjà vu", 40, 60, {
      size: 12,
      color: [17, 24, 39],
    });

    const text = Buffer.from(pdf.toBase64(), "base64").toString("utf8");

    expect(text).toContain("Jose pays deja vu");
  });

  it("writes document metadata into the pdf info dictionary", () => {
    const pdf = new SimplePdfDocument({
      metadata: {
        title: "Catalyst Cash Financial Audit",
        author: "Catalyst Cash",
        subject: "Financial audit tear sheet",
      },
    });

    const text = Buffer.from(pdf.toBase64(), "base64").toString("utf8");

    expect(text).toContain("/Info 5 0 R");
    expect(text).toContain("/Title (Catalyst Cash Financial Audit)");
    expect(text).toContain("/Author (Catalyst Cash)");
    expect(text).toContain("/Subject (Financial audit tear sheet)");
    expect(text).toContain("/Producer (Catalyst Cash)");
  });
});
