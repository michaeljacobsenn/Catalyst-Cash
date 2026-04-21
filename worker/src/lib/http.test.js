import { describe, expect, it } from "vitest";

import { corsHeaders } from "./http.js";

describe("worker corsHeaders", () => {
  it("allows canonical web origins and Pages preview origins", () => {
    const env = {
      ALLOWED_ORIGIN: "https://catalystcash.app,https://www.catalystcash.app,https://catalystcash.pages.dev",
    };

    expect(corsHeaders("https://catalystcash.app", env)["Access-Control-Allow-Origin"]).toBe("https://catalystcash.app");
    expect(corsHeaders("https://www.catalystcash.app", env)["Access-Control-Allow-Origin"]).toBe("https://www.catalystcash.app");
    expect(corsHeaders("https://preview-branch.catalystcash.pages.dev", env)["Access-Control-Allow-Origin"]).toBe(
      "https://preview-branch.catalystcash.pages.dev"
    );
  });

  it("falls back to the primary origin for untrusted origins", () => {
    const env = {
      ALLOWED_ORIGIN: "https://catalystcash.app,https://www.catalystcash.app,https://catalystcash.pages.dev",
    };

    expect(corsHeaders("https://evil.example", env)["Access-Control-Allow-Origin"]).toBe("https://catalystcash.app");
  });
});
