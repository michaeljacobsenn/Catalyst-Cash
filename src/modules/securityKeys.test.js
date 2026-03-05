import { describe, expect, it } from "vitest";
import { isSafeImportKey, isSecuritySensitiveKey } from "./securityKeys.js";

describe("security key guards", () => {
    it("treats secure-storage aliases and entitlement metadata as sensitive", () => {
        expect(isSecuritySensitiveKey("app-passcode")).toBe(true);
        expect(isSecuritySensitiveKey("secure:app-passcode")).toBe(true);
        expect(isSecuritySensitiveKey("subscription-state")).toBe(true);
        expect(isSecuritySensitiveKey("device-id")).toBe(true);
        expect(isSecuritySensitiveKey("api-key-openai")).toBe(true);
    });

    it("only allows safe non-sensitive import keys", () => {
        expect(isSafeImportKey("financial-config")).toBe(true);
        expect(isSafeImportKey("secure:app-passcode")).toBe(false);
        expect(isSafeImportKey("subscription-state")).toBe(false);
        expect(isSafeImportKey("Device-ID")).toBe(false);
    });
});
