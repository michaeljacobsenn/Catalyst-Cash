import { describe, expect, it } from "vitest";

import { resolveStoredThemeMode } from "./SettingsContext.js";

describe("resolveStoredThemeMode", () => {
  it("prefers an in-flight user override over the saved theme", () => {
    expect(resolveStoredThemeMode("dark", "light")).toBe("light");
    expect(resolveStoredThemeMode("system", "dark")).toBe("dark");
  });

  it("falls back to the saved theme when there is no override", () => {
    expect(resolveStoredThemeMode("light", null)).toBe("light");
    expect(resolveStoredThemeMode("system", undefined)).toBe("system");
  });

  it("defaults to system when nothing is stored yet", () => {
    expect(resolveStoredThemeMode(null, null)).toBe("system");
  });
});
