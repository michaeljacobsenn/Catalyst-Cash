import React, { useState } from "react";
import { T } from "../constants.js";
import { ViewToggle } from "../ui.jsx";
import CardPortfolioTab from "./CardPortfolioTab.jsx";
import CardWizardTab from "./CardWizardTab.jsx";

export default function PortfolioTab({ onViewTransactions, proEnabled }) {
  const [activeView, setActiveView] = useState("vault");

  // Catch the custom event to switch views programmatically
  React.useEffect(() => {
    const handleSwitch = (e) => {
      if (e.detail === "vault" || e.detail === "rewards") {
        setActiveView(e.detail);
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
        <ViewToggle
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
          <CardPortfolioTab onViewTransactions={onViewTransactions} proEnabled={proEnabled} embedded />
        </div>
        <div style={{ display: activeView === "rewards" ? "flex" : "none", flex: 1, minHeight: 0, width: "100%" }}>
          <CardWizardTab proEnabled={proEnabled} embedded />
        </div>
      </div>
    </div>
  );
}
