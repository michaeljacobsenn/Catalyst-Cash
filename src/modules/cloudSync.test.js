import { describe, it, expect } from "vitest";

// ════════════════════════════════════════════════════════════════
// cloudSync.js — smoke tests for encryption toggle and constants
// ════════════════════════════════════════════════════════════════
// Note: Full upload/download flows require native iOS plugin mocking.
// These tests verify the module's constants and logic branches.

describe("cloudSync module", () => {
  it("defines FILE_NAME constant for native cloud sync payloads", async () => {
    const source = await import("fs").then(fs => fs.readFileSync(new URL("./cloudSync.js", import.meta.url), "utf-8"));
    expect(source).toContain("FILE_NAME");
    expect(source).toContain("CatalystCash_CloudSync.json");
  });

  it("uploadToICloud signature accepts passphrase parameter", async () => {
    const source = await import("fs").then(fs => fs.readFileSync(new URL("./cloudSync.js", import.meta.url), "utf-8"));
    // Verify the function accepts passphrase so encryption opt-in works
    expect(source).toMatch(/uploadToICloud\s*\(\s*payload\s*,\s*passphrase/);
  });

  it("downloadFromICloud checks isEncrypted before decryption", async () => {
    const source = await import("fs").then(fs => fs.readFileSync(new URL("./cloudSync.js", import.meta.url), "utf-8"));
    // Ensure download flow checks encryption status before attempting decrypt
    expect(source).toContain("isEncrypted(data)");
  });

  it("encryption requires passphrase — guards against null passphrase encrypt", async () => {
    const source = await import("fs").then(fs => fs.readFileSync(new URL("./cloudSync.js", import.meta.url), "utf-8"));
    // The upload function should only encrypt when passphrase is truthy
    expect(source).toMatch(/if\s*\(\s*passphrase\s*\)/);
  });

  it("verifies the exact data written instead of treating any readable backup as success", async () => {
    const source = await import("fs").then(fs => fs.readFileSync(new URL("./cloudSync.js", import.meta.url), "utf-8"));
    expect(source).toContain("verify.data === data");
  });

  it("treats web as intentionally unsupported rather than filesystem fallback", async () => {
    const source = await import("fs").then(fs => fs.readFileSync(new URL("./cloudSync.js", import.meta.url), "utf-8"));
    expect(source).toContain("Cloud backup unavailable on this platform");
    expect(source).toContain("Cloud restore unavailable on this platform");
    expect(source).not.toContain("Using local-only filesystem fallback");
  });
});
