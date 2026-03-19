  import { createContext,useContext,type Dispatch,type MutableRefObject,type ReactNode,type SetStateAction } from "react";
  import type {
    AuditRecord,
    BankAccount,
    Card as CardType,
    CatalystCashConfig,
    MoveCheckState,
    Renewal,
  } from "../../types/index.js";
  import type { AppTab } from "./NavigationContext.js";

interface OverlayContextValue {
  tab: AppTab;
  showGuide: boolean;
  setShowGuide: Dispatch<SetStateAction<boolean>>;
  transactionFeedTab: AppTab | null;
  setTransactionFeedTab: (tab: AppTab | null) => void;
  proEnabled: boolean;
  loading: boolean;
  streamText: string;
  elapsed: number;
  isTest: boolean;
  aiProvider: string;
  aiModel: string;
  activeAuditDraftView: { raw: string } | null;
  resultsBackTarget: AppTab | null;
  setResultsBackTarget: Dispatch<SetStateAction<AppTab | null>>;
  display: AuditRecord | null;
  displayMoveChecks: MoveCheckState;
  trendContextLength: number;
  setupReturnTab: AppTab | null;
  setSetupReturnTab: Dispatch<SetStateAction<AppTab | null>>;
  lastCenterTab: MutableRefObject<AppTab>;
  overlaySourceTab: AppTab | null;
  overlayBaseTab: AppTab | null;
  cards: CardType[];
  bankAccounts: BankAccount[];
  renewals: Renewal[];
  cardAnnualFees: Renewal[];
  current: AuditRecord | null;
  financialConfig: CatalystCashConfig;
  personalRules: string;
  setPersonalRules: (value: string) => void;
  persona: "coach" | "friend" | "nerd" | null;
  instructionHash: string | null;
  setInstructionHash: (value: string | null) => void;
}

interface OverlayProviderProps extends OverlayContextValue {
  children: ReactNode;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children, ...value }: OverlayProviderProps) {
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay() {
  const context = useContext(OverlayContext);
  if (!context) throw new Error("useOverlay must be used within an OverlayProvider");
  return context;
}
