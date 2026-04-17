import { describe, expect, it } from "vitest";

import { getAuditJsonSchema } from "./auditOutputContract.js";

function collectStrictObjectViolations(schema, path = "root", violations = []) {
  if (!schema || typeof schema !== "object") return violations;

  const isObjectSchema =
    schema.type === "object" ||
    (Array.isArray(schema.type) && schema.type.includes("object"));

  if (isObjectSchema && schema.properties && schema.additionalProperties === false) {
    const propertyKeys = Object.keys(schema.properties);
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missing = propertyKeys.filter((key) => !required.includes(key));
    if (missing.length > 0) {
      violations.push({ path, missing });
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, child] of Object.entries(schema.properties)) {
      collectStrictObjectViolations(child, `${path}.properties.${key}`, violations);
    }
  }

  if (schema.items) {
    collectStrictObjectViolations(schema.items, `${path}.items`, violations);
  }

  return violations;
}

describe("auditOutputContract", () => {
  it("keeps every strict object schema OpenAI-compatible", () => {
    const schema = getAuditJsonSchema();
    const violations = collectStrictObjectViolations(schema);
    expect(violations).toEqual([]);
  });
});
