/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PassphraseModal } from "./SettingsTabModals";

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

describe("PassphraseModal", () => {
  it("submits the confirm action only once per click", () => {
    const onConfirm = vi.fn();

    render(
      <PassphraseModal
        open
        mode="export"
        label="Protect this backup with a passphrase."
        value="correct horse battery staple"
        setValue={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    const submitButton = container?.querySelector('button[type="submit"]');
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
