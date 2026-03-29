  import { Suspense,lazy,useCallback,useEffect,useState } from "react";
  import type { AuditFormData } from "../../types/index.js";
  import { StreamingView } from "../components.js";
  import { T } from "../constants.js";
  import type { AppTab,NavViewState } from "../contexts/NavigationContext.js";
  import { useOverlay } from "../contexts/OverlayContext.js";
  import type { SetFinancialConfig } from "../contexts/SettingsContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
import { useSwipeBack } from "../hooks/useSwipeGesture.js";
  import { getModel } from "../providers.js";
import InteractiveStackPane from "../navigation/InteractiveStackPane.js";

  import type { ToastApi } from "../Toast.js";
  import { ErrorBoundary } from "../ui.js";

const loadInputForm = () => import("../tabs/InputForm.js");
const loadResultsView = () => import("../tabs/ResultsView.js");
const loadHistoryTab = () => import("../tabs/HistoryTab.js");
const loadTransactionFeed = () => import("../tabs/TransactionFeed.js");
const loadGuideModal = () => import("../tabs/GuideModal.js");
const loadSettingsTab = () => import("../tabs/SettingsTab.js");

const InputForm = lazy(loadInputForm);
const ResultsView = lazy(loadResultsView);
const HistoryTab = lazy(loadHistoryTab);
const TransactionFeed = lazy(loadTransactionFeed);
const GuideModal = lazy(loadGuideModal);
const SettingsTab = lazy(loadSettingsTab);

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

interface OverlayManagerProps {
  handleConnectAccount: () => Promise<void>;
  handleCancelAudit: () => void;
  dismissRecoverableAuditDraft: () => Promise<void>;
  navTo: (newTab: AppTab, viewState?: NavViewState | null) => void;
  toggleMove: (index: string) => Promise<void>;
  updateMoveAssignment: (index: number, patch: { sourceAccountId?: string | null; targetAccountId?: string | null }) => Promise<void>;
  toast: ToastApi;
  clearAll: () => Promise<void>;
  factoryReset: () => Promise<void>;
  onRestoreComplete: () => Promise<void>;
  onHouseholdSyncConfigured: () => Promise<void>;
  handleRefreshDashboard: () => Promise<void>;
  handleSubmit: (msg: string, formData: AuditFormData, testMode?: boolean, manualResultText?: string | null) => Promise<void>;
  handleManualImport: (resultText: string) => Promise<void>;
  setFinancialConfig: SetFinancialConfig;
  inputFormDb: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    del: (key: string) => Promise<void>;
    keys: () => Promise<string[]>;
    clear: () => Promise<void>;
  };
  themeTick?: number;
}

export default function OverlayManager({
  handleConnectAccount,
  handleCancelAudit,
  dismissRecoverableAuditDraft,
  navTo,
  toggleMove,
  updateMoveAssignment,
  toast,
  clearAll,
  factoryReset,
  onRestoreComplete,
  onHouseholdSyncConfigured,
  handleRefreshDashboard,
  handleSubmit,
  handleManualImport,
  setFinancialConfig,
  inputFormDb,
  themeTick = 0,
}: OverlayManagerProps) {
  const {
    tab,
    showGuide,
    setShowGuide,
    transactionFeedTab,
    setTransactionFeedTab,
    proEnabled,
    loading,
    streamText,
    elapsed,
    isTest,
    aiProvider,
    aiModel,
    activeAuditDraftView,
    resultsBackTarget,
    setResultsBackTarget,
    display,
    displayMoveChecks,
    trendContextLength,
    setupReturnTab,
    setSetupReturnTab,
    lastCenterTab,
    overlaySourceTab,
    cards,
    bankAccounts,
    renewals,
    cardAnnualFees,
    current,
    financialConfig,
    personalRules,
    setPersonalRules,
    persona,
    instructionHash,
    setInstructionHash,
  } = useOverlay();
  const { setAiModel } = useSettings() as { setAiModel: (m: string) => void };
  const onShowGuide = useCallback(() => setShowGuide(true), [setShowGuide]);
  const [settingsCanDismiss, setSettingsCanDismiss] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const warmup = () => {
      void Promise.allSettled([
        loadInputForm(),
        loadResultsView(),
        loadHistoryTab(),
        loadTransactionFeed(),
        loadGuideModal(),
        loadSettingsTab(),
      ]);
    };

    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warmup, { timeout: 1600 })
        : window.setTimeout(warmup, 260);

    return () => {
      if (typeof idleId !== "number" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
        return;
      }
      window.clearTimeout(idleId as number);
    };
  }, []);
  useEffect(() => {
    if (tab !== "settings") {
      setSettingsCanDismiss(true);
    }
  }, [tab]);
  const settingsRefreshActions = {
    onRestoreComplete,
    onHouseholdSyncConfigured,
  };
  const overlaySwipeResults = useSwipeBack(
    useCallback(() => {
      const target = resultsBackTarget === "history" ? "history" : "audit";
      setResultsBackTarget(null);
      navTo(target);
    }, [navTo, resultsBackTarget, setResultsBackTarget]),
    tab === "results",
    { applyBaseParallax: false }
  );

  const overlaySwipeHistory = useSwipeBack(
    useCallback(() => {
      navTo(overlaySourceTab ?? lastCenterTab.current);
    }, [lastCenterTab, navTo, overlaySourceTab]),
    tab === "history",
    { applyBaseParallax: false }
  );

  const overlaySwipeInput = useSwipeBack(
    useCallback(() => {
      navTo(overlaySourceTab ?? "dashboard");
    }, [navTo, overlaySourceTab]),
    tab === "input",
    { applyBaseParallax: false }
  );

  const overlaySwipeSettings = useSwipeBack(
    useCallback(() => {
      if (setupReturnTab) {
        navTo(setupReturnTab);
        setSetupReturnTab(null);
        return;
      }
      navTo(overlaySourceTab ?? lastCenterTab.current);
    }, [lastCenterTab, navTo, overlaySourceTab, setSetupReturnTab, setupReturnTab]),
    tab === "settings" && settingsCanDismiss,
    { applyBaseParallax: false }
  );

  const historyUnderlay = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: T.bg.base,
        overflow: "hidden",
      }}
    >
      <ErrorBoundary name="HistoryUnderlay">
        <Suspense fallback={<TabFallback />}>
          <HistoryTab toast={toast} proEnabled={proEnabled} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );

  return (
    <>
      {showGuide && (
        <Suspense fallback={null}>
          <GuideModal onClose={() => setShowGuide(false)} proEnabled={proEnabled} />
        </Suspense>
      )}

      {transactionFeedTab === tab && (
        <Suspense fallback={<TabFallback />}>
          <TransactionFeed onClose={() => setTransactionFeedTab(null)} proEnabled={proEnabled} onConnectPlaid={handleConnectAccount} />
        </Suspense>
      )}

      {/* InputForm — always mounted so returning to it is instant (no remount/Suspense re-waterfall) */}
      <InteractiveStackPane
        swipe={overlaySwipeInput}
        scrollable
        gestureEnabled={tab === "input"}
        {...(tab !== "input" ? { containerStyle: { zIndex: -1, pointerEvents: "none" as const, visibility: "hidden" as const } } : {})}
      >
        <ErrorBoundary name="InputForm">
          <Suspense fallback={<TabFallback />}>
            <InputForm
              onSubmit={handleSubmit}
              isLoading={loading}
              lastAudit={current}
              renewals={renewals}
              cardAnnualFees={cardAnnualFees}
              cards={cards}
              bankAccounts={bankAccounts}
              onManualImport={handleManualImport}
              toast={toast}
              financialConfig={financialConfig}
              setFinancialConfig={setFinancialConfig}
              aiProvider={aiProvider}
              aiModel={aiModel}
              setAiModel={setAiModel}
              personalRules={personalRules}
              setPersonalRules={setPersonalRules}
              persona={persona}
              instructionHash={instructionHash}
              setInstructionHash={(value: string | number | null) => setInstructionHash(value == null ? null : String(value))}
              db={inputFormDb}
              proEnabled={proEnabled}
              onBack={() => navTo(overlaySourceTab ?? "dashboard")}
            />
          </Suspense>
        </ErrorBoundary>
      </InteractiveStackPane>

      {tab === "results" && (
        <InteractiveStackPane
          swipe={overlaySwipeResults}
          scrollable
          underlay={overlaySourceTab === "history" ? historyUnderlay : undefined}
        >
          {loading ? (
            <StreamingView
              streamText={streamText}
              elapsed={elapsed}
              isTest={isTest}
              modelName={getModel(aiProvider, aiModel)?.name ?? aiModel}
              onCancel={handleCancelAudit}
            />
          ) : activeAuditDraftView ? (
            <StreamingView
              streamText=""
              elapsed={0}
              isTest={false}
              modelName={getModel(aiProvider, aiModel)?.name ?? aiModel}
              title="Audit Interrupted"
              statusLabel="Recovered an interrupted audit session."
              helperText="The previous audit did not finish cleanly. Rerun the audit to generate a complete result."
              onCancel={() => {
                dismissRecoverableAuditDraft().catch(() => {});
                const target = resultsBackTarget === "history" ? "history" : "audit";
                setResultsBackTarget(null);
                navTo(target);
              }}
            />
          ) : !display ? (
            (() => {
              setTimeout(() => navTo("dashboard"), 0);
              return null;
            })()
          ) : (
            <ErrorBoundary name="Results">
              <Suspense fallback={<TabFallback />}>
                <ResultsView
                  themeTick={themeTick}
                  audit={display}
                  moveChecks={displayMoveChecks}
                  onToggleMove={(index: number) => {
                    void toggleMove(String(index));
                  }}
                  onUpdateMoveAssignment={(index, patch) => {
                    void updateMoveAssignment(index, patch);
                  }}
                  streak={trendContextLength}
                  onBack={() => {
                    const target = resultsBackTarget === "history" ? "history" : "audit";
                    setResultsBackTarget(null);
                    navTo(target);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </InteractiveStackPane>
      )}

      {/* HistoryTab — always mounted so navigating back from Results is instant */}
      <InteractiveStackPane
        swipe={overlaySwipeHistory}
        scrollable
        gestureEnabled={tab === "history"}
        {...(tab !== "history" ? { containerStyle: { zIndex: -1, pointerEvents: "none" as const, visibility: "hidden" as const } } : {})}
      >
        <ErrorBoundary name="History">
          <Suspense fallback={<TabFallback />}>
            <HistoryTab toast={toast} proEnabled={proEnabled} themeTick={themeTick} />
          </Suspense>
        </ErrorBoundary>
      </InteractiveStackPane>

      {tab === "settings" && (
        <InteractiveStackPane
          swipe={overlaySwipeSettings}
          underlay={overlaySourceTab === "history" ? historyUnderlay : undefined}
          gestureEnabled={settingsCanDismiss}
        >
          <ErrorBoundary name="Settings">
            <Suspense fallback={<TabFallback />}>
              <SettingsTab
                onClear={clearAll}
                onFactoryReset={factoryReset}
                onClearDemoData={handleRefreshDashboard}
                proEnabled={proEnabled}
                onShowGuide={onShowGuide}
                onBack={() => {
                  if (setupReturnTab) {
                    navTo(setupReturnTab);
                    setSetupReturnTab(null);
                  } else {
                    navTo(overlaySourceTab ?? lastCenterTab.current);
                  }
                }}
                onCanDismissChange={setSettingsCanDismiss}
                {...settingsRefreshActions}
              />
            </Suspense>
          </ErrorBoundary>
        </InteractiveStackPane>
      )}
    </>
  );
}
