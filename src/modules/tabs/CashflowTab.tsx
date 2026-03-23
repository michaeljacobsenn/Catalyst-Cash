  import React,{ useState,type Dispatch,type SetStateAction } from "react";
  import type { BankAccount,Card,CatalystCashConfig,Renewal } from "../../types/index.js";
  import { T } from "../constants.js";
  import { ViewToggle } from "../ui.js";
  import BudgetTab from "./BudgetTab.js";
  import RenewalsTab from "./RenewalsTab.js";

type CashflowView = "renewals" | "budget";

interface ToastApi {
  success?: (message: string) => void;
  error?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
}

interface CashflowTabProps {
  onRunAudit?: (() => void) | undefined;
  toast?: ToastApi | undefined;
  proEnabled?: boolean;
  privacyMode?: boolean;
}

interface SwitchCashflowViewEvent extends Event {
  detail: CashflowView;
}

interface ViewToggleProps {
  options: Array<{ id: CashflowView; label: string }>;
  active: CashflowView;
  onChange: Dispatch<SetStateAction<CashflowView>> | ((value: CashflowView) => void);
}

interface BudgetTabProps {
  onRunAudit?: (() => void) | undefined;
  toast?: ToastApi | undefined;
  embedded?: boolean;
  proEnabled?: boolean;
  privacyMode?: boolean;
}

interface RenewalsTabProps {
  proEnabled?: boolean;
  embedded?: boolean;
  privacyMode?: boolean;
}

const TypedViewToggle = ViewToggle as unknown as (props: ViewToggleProps) => React.ReactNode;
const TypedBudgetTab = BudgetTab as unknown as (props: BudgetTabProps) => React.ReactNode;
const TypedRenewalsTab = RenewalsTab as unknown as (props: RenewalsTabProps) => React.ReactNode;

export default function CashflowTab({ onRunAudit, toast, proEnabled = false, privacyMode = false }: CashflowTabProps) {
  const [activeView, setActiveView] = useState<CashflowView>("renewals");
  const _cashflowTypesAnchor: {
    cards?: Card[];
    bankAccounts?: BankAccount[];
    renewals?: Renewal[];
    financialConfig?: CatalystCashConfig;
  } = {};
  void _cashflowTypesAnchor;

  // Catch the custom event to switch views programmatically
  React.useEffect(() => {
    const handleSwitch = (event: Event): void => {
      const customEvent = event as SwitchCashflowViewEvent;
      if (customEvent.detail === "budget" || customEvent.detail === "renewals") {
        setActiveView(customEvent.detail);
      }
    };
    window.addEventListener("switch-cashflow-view", handleSwitch);
    return () => window.removeEventListener("switch-cashflow-view", handleSwitch);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
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
            { id: "renewals", label: "Bills" },
            { id: "budget", label: "Budget" },
          ]}
          active={activeView}
          onChange={setActiveView}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div style={{ display: activeView === "budget" ? "block" : "none", height: "100%", minHeight: 0 }}>
          <TypedBudgetTab onRunAudit={onRunAudit} toast={toast} embedded proEnabled={proEnabled} privacyMode={privacyMode} />
        </div>
        <div style={{ display: activeView === "renewals" ? "block" : "none", height: "100%", minHeight: 0 }}>
          <TypedRenewalsTab proEnabled={proEnabled} embedded privacyMode={privacyMode} />
        </div>
      </div>
    </div>
  );
}
