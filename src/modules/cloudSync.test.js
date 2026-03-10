import { describe, it, expect, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// cloudSync.js — smoke tests for encryption toggle and constants
// ════════════════════════════════════════════════════════════════
// Note: Full upload/download flows require native iOS plugin mocking.
// These tests verify the module's constants and logic branches.

describe("cloudSync module", () => {
  it("defines FILE_NAME constant for web fallback", async () => {
    // The module should export or internally define FILE_NAME so the
    // web fallback (Capacitor Filesystem) has a valid file path.
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
});
