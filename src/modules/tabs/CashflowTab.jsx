import React, { useState } from "react";
import { T } from "../constants.js";
import { ViewToggle } from "../ui.jsx";
import BudgetTab from "./BudgetTab.jsx";
import RenewalsTab from "./RenewalsTab.jsx";

export default function CashflowTab({
  // Budget props
  onRunAudit,
  toast,
  // Renewals props
  proEnabled,
}) {
  const [activeView, setActiveView] = useState("renewals");

  // Catch the custom event to switch views programmatically
  React.useEffect(() => {
    const handleSwitch = (e) => {
      if (e.detail === "budget" || e.detail === "renewals") {
        setActiveView(e.detail);
      }
    };
    window.addEventListener("switch-cashflow-view", handleSwitch);
    return () => window.removeEventListener("switch-cashflow-view", handleSwitch);
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
            { id: "renewals", label: "Bills" },
            { id: "budget", label: "Budget" },
          ]}
          active={activeView}
          onChange={setActiveView}
        />
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ display: activeView === "budget" ? "block" : "none", height: "100%" }}>
          <BudgetTab onRunAudit={onRunAudit} toast={toast} embedded proEnabled={proEnabled} />
        </div>
        <div style={{ display: activeView === "renewals" ? "block" : "none", height: "100%" }}>
          <RenewalsTab proEnabled={proEnabled} embedded />
        </div>
      </div>
    </div>
  );
}
