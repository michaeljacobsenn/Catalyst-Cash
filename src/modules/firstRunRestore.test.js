import { describe, expect, it } from "vitest";
import { canUsePasscodeForAppLock, hasMeaningfulLocalData } from "./firstRunRestore.js";

function storageFrom(values = {}) {
  return {
    async get(key) {
      return values[key] ?? null;
    },
  };
}

describe("firstRunRestore", () => {
  it("detects a truly empty first-run profile", async () => {
    await expect(hasMeaningfulLocalData(storageFrom())).resolves.toBe(false);
  });

  it("does not overwrite partially entered setup data", async () => {
    await expect(
      hasMeaningfulLocalData(storageFrom({ "financial-config": { preferredName: "Michael" } }))
    ).resolves.toBe(true);
  });

  it("ignores demo-only audit history while checking for user data", async () => {
    await expect(
      hasMeaningfulLocalData(storageFrom({ "audit-history": [{ isDemoHistory: true }] }))
    ).resolves.toBe(false);
  });

  it("accepts numeric app passcodes for restored encrypted iCloud backups", () => {
    expect(canUsePasscodeForAppLock("1234")).toBe(true);
    expect(canUsePasscodeForAppLock("12345678")).toBe(true);
    expect(canUsePasscodeForAppLock("123")).toBe(false);
    expect(canUsePasscodeForAppLock("passphrase")).toBe(false);
  });
});
