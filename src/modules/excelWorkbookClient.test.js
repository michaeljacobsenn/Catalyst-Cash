import { beforeEach, describe, expect, it, vi } from "vitest";

const workbookFns = vi.hoisted(() => ({
  loadWorkbookRows: vi.fn(async () => ({
    sheetNames: ["Setup Data"],
    getSheetRows: (sheetName) => (sheetName === "Setup Data" ? [["Config Key", "Description", "Value"]] : null),
  })),
  createWorkbookBuffer: vi.fn(async () => new ArrayBuffer(16)),
}));

vi.mock("./excelWorkbook.js", () => ({
  loadWorkbookRows: workbookFns.loadWorkbookRows,
  createWorkbookBuffer: workbookFns.createWorkbookBuffer,
}));

describe("excelWorkbookClient", () => {
  beforeEach(() => {
    vi.resetModules();
    workbookFns.loadWorkbookRows.mockClear();
    workbookFns.createWorkbookBuffer.mockClear();
    delete global.Worker;
  });

  it("falls back to direct workbook helpers when Worker is unavailable", async () => {
    const workbookClient = await import("./excelWorkbookClient.js");
    const workbook = await workbookClient.loadWorkbookRows(new ArrayBuffer(8));

    expect(workbookFns.loadWorkbookRows).toHaveBeenCalledTimes(1);
    expect(workbook.sheetNames).toEqual(["Setup Data"]);
    expect(workbook.getSheetRows("Setup Data")).toEqual([["Config Key", "Description", "Value"]]);
  });

  it("uses the workbook worker when Worker is available", async () => {
    class MockWorker {
      listeners = { message: [], error: [] };

      addEventListener(type, handler) {
        this.listeners[type].push(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type] = this.listeners[type].filter((entry) => entry !== handler);
      }

      postMessage(message) {
        queueMicrotask(() => {
          this.listeners.message.forEach((handler) =>
            handler({
              data: {
                id: message.id,
                result: {
                  sheetNames: ["Setup Data"],
                  sheets: {
                    "Setup Data": [["payFrequency", "Description", "bi-weekly"]],
                  },
                },
              },
            })
          );
        });
      }
    }

    global.Worker = MockWorker;

    const workbookClient = await import("./excelWorkbookClient.js");
    const workbook = await workbookClient.loadWorkbookRows(new ArrayBuffer(8));

    expect(workbookFns.loadWorkbookRows).not.toHaveBeenCalled();
    expect(workbook.sheetNames).toEqual(["Setup Data"]);
    expect(workbook.getSheetRows("Setup Data")).toEqual([["payFrequency", "Description", "bi-weekly"]]);
  });

  it("falls back to direct helpers when the workbook worker errors", async () => {
    class MockWorker {
      listeners = { message: [], error: [] };

      addEventListener(type, handler) {
        this.listeners[type].push(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type] = this.listeners[type].filter((entry) => entry !== handler);
      }

      terminate() {}

      postMessage() {
        queueMicrotask(() => {
          this.listeners.error.forEach((handler) => handler({ message: "worker failed" }));
        });
      }
    }

    global.Worker = MockWorker;

    const workbookClient = await import("./excelWorkbookClient.js");
    const workbook = await workbookClient.loadWorkbookRows(new ArrayBuffer(8));

    expect(workbookFns.loadWorkbookRows).toHaveBeenCalledTimes(1);
    expect(workbook.getSheetRows("Setup Data")).toEqual([["Config Key", "Description", "Value"]]);
  });
});
