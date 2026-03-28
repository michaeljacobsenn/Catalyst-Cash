  import { Suspense,lazy,useEffect,useState } from "react";
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
  themeTick?: number;
  proEnabled: boolean;
  privacyMode: boolean;
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
  themeTick = 0,
  proEnabled,
  privacyMode,
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
  const [mountedTabs, setMountedTabs] = useState<Set<AppTab>>(() => new Set(["dashboard", activeTab]));

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (themeTick <= 0) return;
    setMountedTabs(new Set(SWIPE_TAB_ORDER));
  }, [SWIPE_TAB_ORDER, themeTick]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const warmup = () => {
      void Promise.allSettled([
        loadAIChatTab(),
        loadAuditTab(),
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
      {SWIPE_TAB_ORDER.map((t) => {
        const shouldMount = mountedTabs.has(t);
        return (
        <div
          key={t}
          className="snap-page"
          data-tabid={t}
          aria-hidden={activeTab !== t}
          style={{
            overflowY: t === "chat" ? "hidden" : "auto",
            background: t === "chat" ? T.bg.base : undefined,
            pointerEvents: activeTab === t ? "auto" : "none",
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
            <ErrorBoundary name="Dashboard">
              <Suspense fallback={<TabFallback />}>
                {t === "dashboard" && shouldMount && (
                  <DashboardTab
                    themeTick={themeTick}
                    proEnabled={proEnabled}
                    onRefreshDashboard={handleRefreshDashboard}
                    onDemoAudit={handleDemoAudit}
                    onViewTransactions={() => setTransactionFeedTab(t)}
                    onDiscussWithCFO={(prompt: string) => {
                      setChatInitialPrompt(prompt);
                      navTo("chat");
                    }}
                  />
                )}
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary name="AI Chat">
              <Suspense fallback={<TabFallback />}>
                {t === "chat" && shouldMount && (
                  <AIChatTab
                    themeTick={themeTick}
                    proEnabled={proEnabled}
                    privacyMode={privacyMode}
                    initialPrompt={chatInitialPrompt}
                    clearInitialPrompt={() => setChatInitialPrompt(null)}
                    onBack={() => {
                      navTo("dashboard");
                    }}
                    embedded
                  />
                )}
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary name="Cashflow">
              <Suspense fallback={<TabFallback />}>
                {t === "cashflow" && shouldMount && (
                  <CashflowTab themeTick={themeTick} onRunAudit={handleDemoAudit} toast={toast} proEnabled={proEnabled} privacyMode={privacyMode} />
                )}
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary name="Portfolio">
              <Suspense fallback={<TabFallback />}>
                {t === "portfolio" && shouldMount && (
                  <PortfolioTab themeTick={themeTick} onViewTransactions={() => setTransactionFeedTab(t)} proEnabled={proEnabled} privacyMode={privacyMode} />
                )}
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary name="Audit">
              <Suspense fallback={<TabFallback />}>
                {t === "audit" && shouldMount && (
                  <AuditTab themeTick={themeTick} proEnabled={proEnabled} privacyMode={privacyMode} toast={toast} onDemoAudit={handleDemoAudit} />
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )})}
    </>
  );
}
