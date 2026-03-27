import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCapacitor,
  mockWriteFile,
  mockDeleteFile,
  mockShare,
  mockExportFileShare,
  mockLogError,
} = vi.hoisted(() => ({
  mockCapacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
  },
  mockWriteFile: vi.fn(),
  mockDeleteFile: vi.fn(),
  mockShare: vi.fn(),
  mockExportFileShare: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: mockCapacitor,
  registerPlugin: vi.fn(() => ({ share: mockExportFileShare })),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    writeFile: mockWriteFile,
    deleteFile: mockDeleteFile,
  },
}));

vi.mock("@capacitor/share", () => ({
  Share: {
    share: mockShare,
  },
}));

vi.mock("./logger.js", () => ({
  log: {
    error: mockLogError,
  },
}));

import { nativeExport } from "./nativeExport.js";

describe("nativeExport", () => {
  let createObjectUrlSpy;
  let revokeObjectUrlSpy;
  let fakeAnchor;
  let originalDocument;
  let originalWindow;

  beforeEach(() => {
    mockCapacitor.isNativePlatform.mockReturnValue(false);
    mockCapacitor.getPlatform.mockReturnValue("web");
    mockWriteFile.mockReset();
    mockDeleteFile.mockReset();
    mockShare.mockReset();
    mockExportFileShare.mockReset();
    mockLogError.mockReset();
    createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    fakeAnchor = {
      click: vi.fn(),
      href: "",
      download: "",
      target: "",
      rel: "",
    };
    originalDocument = global.document;
    originalWindow = global.window;
    global.document = {
      createElement: vi.fn(() => fakeAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    global.window = {
      toast: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };
  });

  afterEach(() => {
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    global.document = originalDocument;
    global.window = originalWindow;
  });

  it("downloads through the browser when native export is unavailable", async () => {
    const result = await nativeExport("ledger-browser.csv", "a,b,c", "text/csv");

    expect(result).toEqual({ completed: true, source: "browser" });
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it("reuses the same in-flight export request for duplicate taps", async () => {
    const first = nativeExport("ledger-repeat.csv", "a,b,c", "text/csv");
    const second = nativeExport("ledger-repeat.csv", "a,b,c", "text/csv");

    await expect(first).resolves.toEqual({ completed: true, source: "browser" });
    await expect(second).resolves.toEqual({ completed: true, source: "browser" });
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
  });

  it("creates a browser download blob directly from binary payloads", async () => {
    const result = await nativeExport(
      "ledger-binary.xlsx",
      new Uint8Array([67, 67, 49, 50]).buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    expect(result).toEqual({ completed: true, source: "browser" });
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it("returns a non-throwing incomplete result when the native share sheet is cancelled", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");
    mockWriteFile.mockResolvedValue({ uri: "file:///tmp/ledger.csv" });
    mockShare.mockRejectedValue(new Error("User cancelled share"));

    const result = await nativeExport("ledger-cancel.csv", "a,b,c", "text/csv");

    expect(result).toEqual({ completed: false, source: "native" });
    expect(mockExportFileShare).not.toHaveBeenCalled();
  });

  it("throws a clear iOS rebuild error when native export plugins are unimplemented", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");
    mockWriteFile.mockResolvedValue({ uri: "file:///tmp/ledger.csv" });
    mockShare.mockRejectedValue({ code: "UNIMPLEMENTED", message: "not implemented" });
    mockExportFileShare.mockRejectedValue({ code: "UNIMPLEMENTED", message: "not implemented" });

    await expect(nativeExport("ledger-unimplemented.csv", "a,b,c", "text/csv")).rejects.toThrow(
      "Export is unavailable in this build. Rebuild the iPhone app and try again."
    );
    expect(global.window.toast.error).toHaveBeenCalledTimes(1);
  });

  it("normalizes binary payloads to base64 before writing native export files", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");
    mockWriteFile.mockResolvedValue({ uri: "file:///tmp/ledger.xlsx" });
    mockShare.mockResolvedValue({ completed: true });

    await nativeExport(
      "ledger-native.xlsx",
      new Uint8Array([67, 67, 49, 50]).buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "Q0MxMg==",
      })
    );
    expect(mockWriteFile.mock.calls[0][0].encoding).toBeUndefined();
  });
});
