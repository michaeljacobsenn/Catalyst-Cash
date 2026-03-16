import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

const log = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock("./utils.js", () => ({ db }));
vi.mock("./logger.js", () => ({ log }));

const {
  clearAllMemory,
  deleteMemoryFact,
  getMemoryFacts,
  saveMemoryFact,
} = await import("./memoryBank.js");

describe("memoryBank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads facts from storage", async () => {
    db.get.mockResolvedValueOnce([{ key: "persona", value: "coach", timestamp: 1 }]);

    await expect(getMemoryFacts()).resolves.toEqual([{ key: "persona", value: "coach", timestamp: 1 }]);
  });

  it("saves facts without logging raw memory values", async () => {
    db.get.mockResolvedValueOnce([]);
    db.set.mockResolvedValueOnce(undefined);
    log.info.mockResolvedValueOnce(undefined);

    await expect(saveMemoryFact("category_preference", "Starbucks = Guilty Pleasure")).resolves.toBe(true);

    expect(db.set).toHaveBeenCalledWith(
      "catalyst-ai-memory-bank",
      expect.arrayContaining([
        expect.objectContaining({
          key: "category_preference",
          value: "Starbucks = Guilty Pleasure",
        }),
      ])
    );
    expect(log.info).toHaveBeenCalledWith("memory-bank", "Saved memory fact", {
      key: "category_preference",
      totalFacts: 1,
    });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("Guilty Pleasure");
  });

  it("deletes facts and reports only key metadata", async () => {
    db.get.mockResolvedValueOnce([
      { key: "persona", value: "coach", timestamp: 1 },
      { key: "category_preference", value: "Private", timestamp: 2 },
    ]);
    db.set.mockResolvedValueOnce(undefined);
    log.info.mockResolvedValueOnce(undefined);

    await expect(deleteMemoryFact("category_preference")).resolves.toBe(true);
    expect(log.info).toHaveBeenCalledWith("memory-bank", "Deleted memory fact", {
      key: "category_preference",
      totalFacts: 1,
    });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("Private");
  });

  it("clears memory state", async () => {
    db.del.mockResolvedValueOnce(undefined);
    log.info.mockResolvedValueOnce(undefined);

    await expect(clearAllMemory()).resolves.toBe(true);
    expect(db.del).toHaveBeenCalledWith("catalyst-ai-memory-bank");
    expect(log.info).toHaveBeenCalledWith("memory-bank", "Cleared all memory facts");
  });
});
