  import { Suspense,lazy,useEffect } from "react";
  import { useReducedMotion } from "framer-motion";
  import { T } from "../constants.js";
  import type { AppTab,NavViewState } from "../contexts/NavigationContext.js";
  import type { ToastApi } from "../Toast.js";
  import { ErrorBoundary } from "../ui.js";

const loadDashboardTab = () => import("../tabs/DashboardTab.js");
const loadAIChatTab = () => import("../tabs/AIChatTab.js");
const loadCashflowTab = () => import("../tabs/CashflowTab.js");
const loadPortfolioTab = () => import("../tabs/PortfolioTab.js");
const loadAuditTab = () => import("../tabs/AuditTab.js");
const loadCardPortfolioTab = () => import("../tabs/CardPortfolioTab.js");
const loadCardWizardTab = () => import("../tabs/CardWizardTab.js");

const DashboardTab = lazy(loadDashboardTab);
const AIChatTab = lazy(loadAIChatTab);
const CashflowTab = lazy(loadCashflowTab);
const PortfolioTab = lazy(loadPortfolioTab);
const AuditTab = lazy(loadAuditTab);

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
  activeTab: AppTab;
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
  activeTab,
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
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const warmup = () => {
      void Promise.allSettled([
        loadDashboardTab(),
        loadAIChatTab(),
        loadCashflowTab(),
        loadPortfolioTab(),
        loadAuditTab(),
        loadCardPortfolioTab(),
        loadCardWizardTab(),
      ]);
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
    <>
      {SWIPE_TAB_ORDER.map((t) => (
        <div
          key={t}
          className="snap-page"
          data-tabid={t}
          style={{
            overflowY: t === "chat" ? "hidden" : "auto",
            background: t === "chat" ? T.bg.base : undefined,
          }}
          onScroll={(event) => onPageScroll(event, t)}
        >
          <div
            style={{
              minHeight: "100%",
              opacity: activeTab === t ? 1 : 0.985,
              transform: activeTab === t ? "translateY(0)" : "translateY(1px)",
              transition: prefersReducedMotion ? "none" : "opacity 120ms ease-out, transform 120ms ease-out",
              willChange: prefersReducedMotion ? undefined : "opacity, transform",
            }}
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
        </div>
      ))}
    </>
  );
}
