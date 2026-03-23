  import React,{ Suspense,lazy,useEffect,useState,type Dispatch,type SetStateAction } from "react";
  import type { BankAccount,Card } from "../../types/index.js";
  import { T } from "../constants.js";
  import { ViewToggle } from "../ui.js";
const loadCardPortfolioTab = () => import("./CardPortfolioTab.js");
const loadCardWizardTab = () => import("./CardWizardTab.js");

const CardPortfolioTab = lazy(loadCardPortfolioTab);
const CardWizardTab = lazy(loadCardWizardTab);

type PortfolioView = "vault" | "rewards";

interface PortfolioTabProps {
  onViewTransactions?: (() => void) | undefined;
  proEnabled?: boolean;
  privacyMode?: boolean;
}

interface SwitchPortfolioViewEvent extends Event {
  detail: PortfolioView;
}

interface ViewToggleProps {
  options: Array<{ id: PortfolioView; label: string }>;
  active: PortfolioView;
  onChange: Dispatch<SetStateAction<PortfolioView>> | ((value: PortfolioView) => void);
}

interface CardPortfolioTabProps {
  onViewTransactions?: (() => void) | undefined;
  proEnabled?: boolean;
  embedded?: boolean;
  privacyMode?: boolean;
}

interface CardWizardTabProps {
  proEnabled?: boolean;
  embedded?: boolean;
  privacyMode?: boolean;
}

const TypedViewToggle = ViewToggle as unknown as (props: ViewToggleProps) => React.ReactNode;
const TypedCardPortfolioTab = CardPortfolioTab as unknown as (props: CardPortfolioTabProps) => React.ReactNode;
const TypedCardWizardTab = CardWizardTab as unknown as (props: CardWizardTabProps) => React.ReactNode;

const PortfolioViewFallback = () => (
  <div style={{ width: "100%", padding: "20px 16px" }}>
    <div
      style={{
        height: 88,
        borderRadius: 20,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${T.border.subtle}`,
      }}
    />
  </div>
);

export default function PortfolioTab({ onViewTransactions, proEnabled = false, privacyMode = false }: PortfolioTabProps) {
  const [activeView, setActiveView] = useState<PortfolioView>("vault");
  const _portfolioTypesAnchor: { cards?: Card[]; bankAccounts?: BankAccount[] } = {};
  void _portfolioTypesAnchor;

  // Catch the custom event to switch views programmatically
  React.useEffect(() => {
    const handleSwitch = (event: Event): void => {
      const customEvent = event as SwitchPortfolioViewEvent;
      if (customEvent.detail === "vault" || customEvent.detail === "rewards") {
        setActiveView(customEvent.detail);
      }
    };
    window.addEventListener("switch-portfolio-view", handleSwitch);
    return () => window.removeEventListener("switch-portfolio-view", handleSwitch);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const warmup = () => {
      void Promise.allSettled([loadCardPortfolioTab(), loadCardWizardTab()]);
    };
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warmup, { timeout: 1200 })
        : window.setTimeout(warmup, 180);

    return () => {
      if (typeof idleId !== "number" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
        return;
      }
      window.clearTimeout(idleId as number);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div
        style={{
          padding: "16px 16px 4px 16px",
          background: T.bg.base,
          display: "flex",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <TypedViewToggle
          options={[
            { id: "vault", label: "Vault" },
            { id: "rewards", label: "Rewards" },
          ]}
          active={activeView}
          onChange={setActiveView}
        />
      </div>

      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: activeView === "vault" ? "flex" : "none", flex: 1, minHeight: 0 }}>
          <Suspense fallback={<PortfolioViewFallback />}>
            <TypedCardPortfolioTab onViewTransactions={onViewTransactions} proEnabled={proEnabled} embedded privacyMode={privacyMode} />
          </Suspense>
        </div>
        <div style={{ display: activeView === "rewards" ? "flex" : "none", flex: 1, minHeight: 0, width: "100%" }}>
          <Suspense fallback={<PortfolioViewFallback />}>
            <TypedCardWizardTab proEnabled={proEnabled} embedded privacyMode={privacyMode} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
