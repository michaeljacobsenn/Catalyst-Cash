import { describe, expect, it, vi, beforeEach } from "vitest";

const { dbStore } = vi.hoisted(() => ({
  dbStore: new Map(),
}));

vi.mock("./utils.js", () => ({
  db: {
    get: vi.fn(async (key) => (dbStore.has(key) ? dbStore.get(key) : null)),
    set: vi.fn(async (key, value) => {
      dbStore.set(key, value);
    }),
    del: vi.fn(async (key) => {
      dbStore.delete(key);
    }),
    keys: vi.fn(async () => Array.from(dbStore.keys())),
  },
}));

vi.mock("./appErrors.js", () => ({
  normalizeAppError: (error) => ({ rawMessage: String(error?.message || error || ""), kind: "unknown", userMessage: "error" }),
}));

vi.mock("./backendUrl.js", () => ({
  getBackendUrl: () => "https://example.test",
}));

vi.mock("./crypto.js", () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("./identitySession.js", () => ({
  buildIdentityHeaders: vi.fn(async (headers = {}) => headers),
}));

vi.mock("./logger.js", () => ({
  log: {
    error: vi.fn(),
  },
}));

vi.mock("./securityKeys.js", () => ({
  isSecuritySensitiveKey: () => false,
  sanitizePlaidForBackup: (value) => value,
}));

import { mergeHouseholdState } from "./householdSync.js";

describe("mergeHouseholdState", () => {
  beforeEach(() => {
    dbStore.clear();
  });

  it("records conflict metadata when a newer remote payload overwrites differing local state", async () => {
    dbStore.set("household-last-sync-ts", 100);
    dbStore.set("household-sync-version", 1);
    dbStore.set("financial-config", { paycheckStandard: 4900 });

    const result = await mergeHouseholdState(
      {
        data: {
          "financial-config": { paycheckStandard: 5100 },
        },
        timestamp: 200,
      },
      2
    );

    expect(result).toMatchObject({
      merged: true,
      conflict: true,
      overwrittenKeys: ["financial-config"],
    });
    expect(dbStore.get("financial-config")).toEqual({ paycheckStandard: 5100 });
    expect(dbStore.get("household-last-conflict")).toMatchObject({
      remoteVersion: 2,
      localVersion: 1,
      overwrittenKeys: ["financial-config"],
    });
  });

  it("ignores older remote state", async () => {
    dbStore.set("household-last-sync-ts", 200);
    dbStore.set("household-sync-version", 3);
    dbStore.set("financial-config", { paycheckStandard: 5100 });

    const result = await mergeHouseholdState(
      {
        data: {
          "financial-config": { paycheckStandard: 4900 },
        },
        timestamp: 100,
      },
      2
    );

    expect(result).toEqual({
      merged: false,
      conflict: false,
      overwrittenKeys: [],
    });
    expect(dbStore.get("financial-config")).toEqual({ paycheckStandard: 5100 });
  });

  it("clears stale conflict state after a later clean merge", async () => {
    dbStore.set("household-last-sync-ts", 100);
    dbStore.set("household-sync-version", 1);
    dbStore.set("household-last-conflict", {
      remoteVersion: 1,
      localVersion: 0,
      overwrittenKeys: ["financial-config"],
    });
    dbStore.set("financial-config", { paycheckStandard: 4900 });

    const result = await mergeHouseholdState(
      {
        data: {
          "financial-config": { paycheckStandard: 5100 },
        },
        timestamp: 200,
      },
      2
    );

    expect(result).toMatchObject({
      merged: true,
      conflict: true,
    });

    dbStore.set("household-last-sync-ts", 200);
    dbStore.set("household-sync-version", 2);

    const cleanResult = await mergeHouseholdState(
      {
        data: {
          "financial-config": { paycheckStandard: 5100 },
        },
        timestamp: 300,
      },
      3
    );

    expect(cleanResult).toEqual({
      merged: true,
      conflict: false,
      overwrittenKeys: [],
    });
    expect(dbStore.has("household-last-conflict")).toBe(false);
  });
});
