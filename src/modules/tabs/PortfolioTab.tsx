import React, { useState, type Dispatch, type SetStateAction } from "react";
import { T } from "../constants.js";
import { ViewToggle } from "../ui.jsx";
import CardPortfolioTab from "./CardPortfolioTab.jsx";
import CardWizardTab from "./CardWizardTab.jsx";
import type { BankAccount, Card } from "../../types/index.js";

type PortfolioView = "vault" | "rewards";

interface PortfolioTabProps {
  onViewTransactions?: (() => void) | undefined;
  proEnabled?: boolean;
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
}

interface CardWizardTabProps {
  proEnabled?: boolean;
  embedded?: boolean;
}

const TypedViewToggle = ViewToggle as unknown as (props: ViewToggleProps) => React.ReactNode;
const TypedCardPortfolioTab = CardPortfolioTab as unknown as (props: CardPortfolioTabProps) => React.ReactNode;
const TypedCardWizardTab = CardWizardTab as unknown as (props: CardWizardTabProps) => React.ReactNode;

export default function PortfolioTab({ onViewTransactions, proEnabled = false }: PortfolioTabProps) {
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
          <TypedCardPortfolioTab onViewTransactions={onViewTransactions} proEnabled={proEnabled} embedded />
        </div>
        <div style={{ display: activeView === "rewards" ? "flex" : "none", flex: 1, minHeight: 0, width: "100%" }}>
          <TypedCardWizardTab proEnabled={proEnabled} embedded />
        </div>
      </div>
    </div>
  );
}
