import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockNativeExport,
  mockLogError,
} = vi.hoisted(() => ({
  mockNativeExport: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("./nativeExport.js", () => ({
  nativeExport: mockNativeExport,
}));

vi.mock("./logger.js", () => ({
  log: {
    error: mockLogError,
  },
}));

import { exportAudit, exportAuditCsv } from "./auditExports.js";

describe("auditExports", () => {
  let originalWindow;

  beforeEach(() => {
    mockNativeExport.mockReset();
    mockLogError.mockReset();
    originalWindow = global.window;
    global.window = {
      __privacyMode: false,
    };
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it("exports audit csv rows through nativeExport", async () => {
    mockNativeExport.mockResolvedValue({ completed: true, source: "browser" });

    await exportAuditCsv({
      date: "2026-03-26",
      parsed: {
        status: "GREEN",
        mode: "STANDARD",
        netWorth: 42000,
        raw: 'Cash is "stable"',
        healthScore: { score: 82, grade: "B" },
      },
    });

    expect(mockNativeExport).toHaveBeenCalledTimes(1);
    const [filename, csv, mimeType] = mockNativeExport.mock.calls[0];
    expect(filename).toBe("CatalystCash_Audit_2026-03-26.csv");
    expect(mimeType).toBe("text/csv");
    expect(csv).toContain('"Net Worth"');
    expect(csv).toContain('"42000"');
  });

  it("exports a direct pdf tear sheet through nativeExport", async () => {
    mockNativeExport.mockResolvedValue({ completed: true, source: "browser" });

    await exportAudit({
      date: "2026-03-26",
      parsed: {
        status: "GREEN",
        mode: "STANDARD",
        netWorth: 42000,
        raw: "Everything is on track.",
      },
    });

    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockNativeExport).toHaveBeenCalledTimes(1);
    const [filename, payload, mimeType, isBase64] = mockNativeExport.mock.calls[0];
    expect(filename).toBe("CatalystCash_CPA_TearSheet_2026-03-26.pdf");
    expect(mimeType).toBe("application/pdf");
    expect(isBase64).toBe(true);
    expect(Buffer.from(payload, "base64").toString("utf8")).toContain("%PDF-1.4");
  });

  it("falls back to html export when pdf generation fails", async () => {
    mockNativeExport.mockImplementationOnce(() => {
      throw new Error("render failed");
    });
    mockNativeExport.mockResolvedValueOnce({ completed: true, source: "browser" });

    await exportAudit({
      date: "2026-03-26",
      parsed: {
        status: "GREEN",
        mode: "STANDARD",
        netWorth: 42000,
        raw: "Everything is on track.",
        healthScore: { score: 82, summary: "Finances are healthy and stable." },
      },
    });

    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockNativeExport).toHaveBeenCalledTimes(2);
    const [filename, html, mimeType] = mockNativeExport.mock.calls[1];
    expect(filename).toBe("CatalystCash_Audit_2026-03-26.html");
    expect(mimeType).toBe("text/html");
    expect(html).toContain("Catalyst Cash");
    expect(html).toContain("Finances are healthy and stable.");
  });
});
