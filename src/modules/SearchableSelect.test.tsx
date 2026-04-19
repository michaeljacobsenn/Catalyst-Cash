/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchableSelect from "./SearchableSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
}

describe("SearchableSelect", () => {
  it("exposes listbox state and closes cleanly on Escape", () => {
    render(
      <SearchableSelect
        options={[
          { value: "chase", label: "Chase" },
          { value: "amex", label: "American Express" },
        ]}
        value={null}
        onChange={vi.fn()}
        placeholder="Select account…"
      />
    );

    const trigger = container?.querySelector("button");
    expect(trigger).toBeTruthy();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.querySelector('[role="listbox"]')).toBeTruthy();

    const searchInput = document.body.querySelector('input[aria-label="Filter options"]');
    expect(searchInput).toBeTruthy();

    act(() => {
      searchInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });
});
