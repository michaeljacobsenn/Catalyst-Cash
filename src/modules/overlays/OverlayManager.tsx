  import { Suspense,lazy,useCallback } from "react";
  import { motion } from "framer-motion";
  import type { AuditFormData } from "../../types/index.js";
  import { StreamingView } from "../components.js";
  import type { AppTab,NavViewState } from "../contexts/NavigationContext.js";
  import { useOverlay } from "../contexts/OverlayContext.js";
  import type { SetFinancialConfig } from "../contexts/SettingsContext.js";
  import { useSwipeBack,useSwipeDown } from "../hooks/useSwipeGesture.js";
  import { getModel } from "../providers.js";
  import { buildSettingsRefreshActions } from "../recoveryFlows.js";
  import type { ToastApi } from "../Toast.js";
  import { ErrorBoundary } from "../ui.js";

const InputForm = lazy(() => import("../tabs/InputForm.js"));
const ResultsView = lazy(() => import("../tabs/ResultsView.js"));
const HistoryTab = lazy(() => import("../tabs/HistoryTab.js"));
const TransactionFeed = lazy(() => import("../tabs/TransactionFeed.js"));
const GuideModal = lazy(() => import("../tabs/GuideModal.js"));
const SettingsTab = lazy(() => import("../tabs/SettingsTab.js"));

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
}

export default function OverlayManager({
  handleConnectAccount,
  handleCancelAudit,
  dismissRecoverableAuditDraft,
  navTo,
  toggleMove,
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
  const onShowGuide = useCallback(() => setShowGuide(true), [setShowGuide]);
  const settingsRefreshActions = buildSettingsRefreshActions({
    onRestoreComplete,
    onHouseholdSyncConfigured,
  });
  const overlaySwipeResults = useSwipeBack(
    useCallback(() => {
      const target = resultsBackTarget === "history" ? "history" : "audit";
      setResultsBackTarget(null);
      navTo(target);
    }, [navTo, resultsBackTarget, setResultsBackTarget])
  );

  const overlaySwipeHistory = useSwipeBack(
    useCallback(() => {
      navTo(lastCenterTab.current);
    }, [lastCenterTab, navTo])
  );

  const overlaySwipeGuide = useSwipeDown(
    useCallback(() => {
      setShowGuide(false);
    }, [setShowGuide])
  );

  return (
    <>
      {showGuide && (
        <Suspense fallback={null}>
          <GuideModal onClose={() => setShowGuide(false)} swipeHook={overlaySwipeGuide} proEnabled={proEnabled} />
        </Suspense>
      )}

      {transactionFeedTab === tab && (
        <Suspense fallback={<TabFallback />}>
          <TransactionFeed onClose={() => setTransactionFeedTab(null)} proEnabled={proEnabled} onConnectPlaid={handleConnectAccount} />
        </Suspense>
      )}

      {tab === "input" && (
        <div className="slide-pane safe-scroll-body" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 20 }}>
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
                personalRules={personalRules}
                setPersonalRules={setPersonalRules}
                persona={persona}
                instructionHash={instructionHash}
                setInstructionHash={(value: string | number | null) => setInstructionHash(value == null ? null : String(value))}
                db={inputFormDb}
                proEnabled={proEnabled}
                onBack={() => navTo("dashboard")}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {tab === "results" && (
        <motion.div
          ref={overlaySwipeResults.paneRef}
          {...overlaySwipeResults.bind()}
          className="slide-pane safe-scroll-body"
          style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
            zIndex: 20,
            touchAction: "pan-y",
            ...overlaySwipeResults.motionStyle,
          }}
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
              streamText={`${activeAuditDraftView.raw}\n\n[Recovered interrupted draft — rerun the audit to finish.]`}
              elapsed={0}
              isTest={false}
              modelName={getModel(aiProvider, aiModel)?.name ?? aiModel}
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
                  audit={display}
                  moveChecks={displayMoveChecks}
                  onToggleMove={(index: number) => {
                    void toggleMove(String(index));
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
        </motion.div>
      )}

      {tab === "history" && (
        <motion.div
          ref={overlaySwipeHistory.paneRef}
          {...overlaySwipeHistory.bind()}
          className="slide-pane safe-scroll-body"
          style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
            zIndex: 20,
            touchAction: "pan-y",
            ...overlaySwipeHistory.motionStyle,
          }}
        >
          <ErrorBoundary name="History">
            <Suspense fallback={<TabFallback />}>
              <HistoryTab toast={toast} proEnabled={proEnabled} />
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      )}

      {tab === "settings" && (
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
                  navTo(lastCenterTab.current);
                }
              }}
              {...settingsRefreshActions}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
