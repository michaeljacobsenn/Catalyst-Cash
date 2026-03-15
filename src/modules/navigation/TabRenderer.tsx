  import { Suspense,lazy } from "react";
  import { T } from "../constants.js";
  import type { AppTab,NavViewState } from "../contexts/NavigationContext.js";
  import type { ToastApi } from "../Toast.js";
  import { ErrorBoundary } from "../ui.js";

const DashboardTab = lazy(() => import("../tabs/DashboardTab.js"));
const AIChatTab = lazy(() => import("../tabs/AIChatTab.js"));
const CashflowTab = lazy(() => import("../tabs/CashflowTab.js"));
const PortfolioTab = lazy(() => import("../tabs/PortfolioTab.js"));
const AuditTab = lazy(() => import("../tabs/AuditTab.js"));

const TabFallback = () => (
  <div className="skeleton-loader" style={{ padding: "20px 16px" }}>
    <div className="skeleton-block" style={{ height: 48, borderRadius: 14 }} />
    <div className="skeleton-block" style={{ height: 120, borderRadius: 16 }} />
    <div style={{ display: "flex", gap: 10 }}>
      <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
      <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
    </div>
    <div className="skeleton-block" style={{ height: 64, borderRadius: 14 }} />
  </div>
);

interface TabRendererProps {
  SWIPE_TAB_ORDER: readonly AppTab[];
  proEnabled: boolean;
  toast: ToastApi;
  navTo: (newTab: AppTab, viewState?: NavViewState | null) => void;
  handleRefreshDashboard: () => Promise<void>;
  handleDemoAudit: () => Promise<void>;
  setTransactionFeedTab: (tab: AppTab | null) => void;
  chatInitialPrompt: string | null;
  setChatInitialPrompt: (prompt: string | null) => void;
  onPageScroll: (event: React.UIEvent<HTMLDivElement>, tab: AppTab) => void;
}

export default function TabRenderer({
  SWIPE_TAB_ORDER,
  proEnabled,
  toast,
  navTo,
  handleRefreshDashboard,
  handleDemoAudit,
  setTransactionFeedTab,
  chatInitialPrompt,
  setChatInitialPrompt,
  onPageScroll,
}: TabRendererProps) {
  return (
    <>
      {SWIPE_TAB_ORDER.map((t) => (
        <div
          key={t}
          className="snap-page"
          data-tabid={t}
          style={{
            overflowY: t === "chat" ? "hidden" : "auto",
            paddingBottom: t === "chat" ? 0 : "calc(env(safe-area-inset-bottom, 20px) + 90px)",
            background: t === "chat" ? T.bg.base : undefined,
          }}
          onScroll={(event) => onPageScroll(event, t)}
        >
          {t === "dashboard" && (
            <ErrorBoundary name="Dashboard">
              <Suspense fallback={<TabFallback />}>
                <DashboardTab
                  proEnabled={proEnabled}
                  onRefreshDashboard={handleRefreshDashboard}
                  onDemoAudit={handleDemoAudit}
                  onViewTransactions={() => setTransactionFeedTab(t)}
                  onDiscussWithCFO={(prompt: string) => {
                    setChatInitialPrompt(prompt);
                    navTo("chat");
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {t === "chat" && (
            <ErrorBoundary name="AI Chat">
              <Suspense fallback={<TabFallback />}>
                <AIChatTab
                  proEnabled={proEnabled}
                  initialPrompt={chatInitialPrompt}
                  clearInitialPrompt={() => setChatInitialPrompt(null)}
                  onBack={() => {
                    navTo("dashboard");
                  }}
                  embedded
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {t === "cashflow" && (
            <ErrorBoundary name="Cashflow">
              <Suspense fallback={<TabFallback />}>
                <CashflowTab onRunAudit={handleDemoAudit} toast={toast} proEnabled={proEnabled} />
              </Suspense>
            </ErrorBoundary>
          )}

          {t === "portfolio" && (
            <ErrorBoundary name="Portfolio">
              <Suspense fallback={<TabFallback />}>
                <PortfolioTab onViewTransactions={() => setTransactionFeedTab(t)} proEnabled={proEnabled} />
              </Suspense>
            </ErrorBoundary>
          )}

          {t === "audit" && (
            <ErrorBoundary name="Audit">
              <Suspense fallback={<TabFallback />}>
                <AuditTab proEnabled={proEnabled} toast={toast} onDemoAudit={handleDemoAudit} />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      ))}
    </>
  );
}
