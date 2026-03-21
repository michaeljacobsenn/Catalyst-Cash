  import { Suspense,lazy,memo,useCallback,useEffect,useMemo,useRef,useState } from "react";
  import type { BankAccount,CatalystCashConfig,PlaidInvestmentAccount,Card as PortfolioCard } from "../../types/index.js";
  import { T } from "../constants.js";
  import { haptic } from "../haptics.js";
  import {
    Link2,
    Loader2,
    Plus,
    ReceiptText,
    RefreshCw,
  } from "../icons";
  import {
    applyBalanceSync,
    autoMatchAccounts,
    connectBank,
    fetchBalancesAndLiabilities,
    purgeBrokenConnections,
    saveConnectionLinks,
  } from "../plaid.js";
  import BankAccountsSection from "../portfolio/BankAccountsSection.js";
  import CreditCardsSection from "../portfolio/CreditCardsSection.js";
  import CreditUtilizationWidget from "../portfolio/CreditUtilizationWidget.js";
  import OtherAssetsSection from "../portfolio/OtherAssetsSection.js";
  import { usePlaidSync } from "../usePlaidSync.js";
  import { fmt } from "../utils.js";
const InvestmentsSection = lazy(() => import("../portfolio/InvestmentsSection.js"));
const TransactionsSection = lazy(() => import("../portfolio/TransactionsSection.js"));
const AddAccountSheet = lazy(() => import("./AddAccountSheet.js"));

const ENABLE_PLAID = true;

// One-time cleanup flag — runs once per app session
let _purgeDone = false;

function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []) {
  if (!incoming.length) return existing;
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) {
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

  import { useAudit } from "../contexts/AuditContext.js";
  import { PortfolioContext,usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import useDashboardData from "../dashboard/useDashboardData.js";
  import type { PortfolioCollapsedSections } from "../portfolio/types.js";

type AddSheetStep = "goal" | "asset" | "debt" | null;
type PlaidConnectResult = "success" | "error" | null;

interface CardPortfolioTabProps {
  onViewTransactions?: (() => void) | null;
  proEnabled?: boolean;
}

export default memo(function CardPortfolioTab({ onViewTransactions, proEnabled = false }: CardPortfolioTabProps) {
  const { current } = useAudit();
  const portfolioContext = usePortfolio();
  const isTest = current?.isTest;

  const cards: PortfolioCard[] = isTest ? current.demoPortfolio?.cards || [] : portfolioContext.cards;
  const setCards = isTest ? () => { } : portfolioContext.setCards;
  const bankAccounts: BankAccount[] = isTest ? current.demoPortfolio?.bankAccounts || [] : portfolioContext.bankAccounts;
  const setBankAccounts = isTest ? () => { } : portfolioContext.setBankAccounts;
  const renewals = isTest ? current.demoPortfolio?.renewals || [] : portfolioContext.renewals;
  const setRenewals = isTest ? () => { } : portfolioContext.setRenewals;

  const { cardCatalog } = portfolioContext;
  const { financialConfig = {} as CatalystCashConfig, setFinancialConfig } = useSettings();

  // Bring in unified master metrics globally calculated
  const { portfolioMetrics } = useDashboardData();

  const demoOverrideContext = useMemo(() => {
    if (!isTest) return portfolioContext;
    return {
      ...portfolioContext,
      cards, setCards,
      bankAccounts, setBankAccounts,
      renewals, setRenewals,
    };
  }, [isTest, portfolioContext, cards, bankAccounts, renewals]);

  useState<AddSheetStep>(null); // kept for legacy compat
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addSheetStep, setAddSheetStep] = useState<AddSheetStep>(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidResult, setPlaidResult] = useState<PlaidConnectResult>(null);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const openSheet = (step: AddSheetStep = null) => {
    setShowAddSheet(true);
    setAddSheetStep(step);
    setPlaidResult(null);
    setPlaidError(null);
  };
  const closeSheet = () => {
    setShowAddSheet(false);
    setAddSheetStep(null);
    setPlaidResult(null);
    setPlaidError(null);
  };

  // Purge broken connections (missing access token due to previous bug) on first mount
  useEffect(() => {
    if (_purgeDone) return;
    _purgeDone = true;
    purgeBrokenConnections()
      .then(count => {
        if (count > 0) {
          window.toast?.info?.(`Removed ${count} broken connection(s) — please reconnect via Plaid`);
        }
      })
      .catch(() => { });
  }, []);
  const handlePlaidConnect = async () => {
    setPlaidLoading(true);
    setPlaidResult(null);
    setPlaidError(null);
    try {
      await connectBank(
        async connection => {
          const plaidInvestments = financialConfig.plaidInvestments || [];
          const { newCards, newBankAccounts, newPlaidInvestments } = autoMatchAccounts(
            connection,
            cards,
            bankAccounts,
            cardCatalog as null | undefined,
            plaidInvestments
          ) as { newCards: PortfolioCard[]; newBankAccounts: BankAccount[]; newPlaidInvestments: PlaidInvestmentAccount[] };
          await saveConnectionLinks(connection);

          // Build deterministic local snapshot so we do not drop new Plaid records.
          const allCards = mergeUniqueById<PortfolioCard>(cards, newCards);
          const allBanks = mergeUniqueById<BankAccount>(bankAccounts, newBankAccounts);
          const allInvests = mergeUniqueById<PlaidInvestmentAccount>(plaidInvestments, newPlaidInvestments);
          setCards(allCards);
          setBankAccounts(allBanks);
          if (newPlaidInvestments.length > 0) {
            setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: allInvests });
          }

          // Fetch live balances and apply them
          try {
            const refreshed = await fetchBalancesAndLiabilities(connection.id);
            if (refreshed) {
              const { updatedCards, updatedBankAccounts, updatedPlaidInvestments } = applyBalanceSync(
                refreshed,
                allCards,
                allBanks,
                allInvests
              ) as { updatedCards: PortfolioCard[]; updatedBankAccounts: BankAccount[]; updatedPlaidInvestments?: PlaidInvestmentAccount[] };
              setCards(updatedCards);
              setBankAccounts(updatedBankAccounts);
              if (updatedPlaidInvestments) {
                setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: updatedPlaidInvestments });
              }
              await saveConnectionLinks(refreshed);
            }
          } catch (balErr) {
            const message = balErr instanceof Error ? balErr.message : String(balErr);
            console.error("[Plaid] Balance fetch after connect failed:", message);
            window.toast?.info?.("Connected! Tap Sync to fetch balances.");
          }

          setPlaidResult("success");
          setCollapsedSections(p => ({ ...p, creditCards: false, bankAccounts: false }));

          // Count what was imported for the review alert
          const importedCount = newCards.length + newBankAccounts.length + newPlaidInvestments.length;

          setTimeout(() => {
            closeSheet();
            // Native iOS alert prompting user to review imported accounts
            if (importedCount > 0) {
              setTimeout(() => {
                window.alert(
                  `${importedCount} account${importedCount !== 1 ? "s" : ""} imported!\n\n` +
                  'Plaid may assign generic names like "Credit Card" instead of the actual product name.\n\n' +
                  "Please tap the ✏️ edit button on each imported account to verify and update:\n" +
                  "• Card name (e.g. Sapphire Preferred)\n" +
                  "• APR\n" +
                  "• Annual fee & due date\n" +
                  "• Statement close & payment due days"
                );
              }, 400);
            }
          }, 2200);
        },
        err => {
          if (err?.message !== "cancelled") {
            setPlaidResult("error");
            const msg = err?.message || "Connection failed";
            setPlaidError(msg);
            window.toast?.error?.(msg);
          }
        }
      );
    } finally {
      setPlaidLoading(false);
    }
  };

  // Plaid balance sync via shared hook
  const { syncing: plaidRefreshing, sync: handleRefreshPlaid } = usePlaidSync({
    cards,
    bankAccounts,
    financialConfig,
    setCards,
    setBankAccounts,
    setFinancialConfig,
    successMessage: "Synced balances successfully",
    autoFetchTransactions: true,
  });
  // Master collapsible sections (all collapsed by default for a clean, compact view)
  const [collapsedSections, setCollapsedSections] = useState<PortfolioCollapsedSections>({
    creditCards: true,
    bankAccounts: true,
    savingsAccounts: true,
    investments: true,
    savingsGoals: true,
    otherAssets: true,
    debts: true,
    transactions: true,
  });  // ── Pull-to-refresh ──────────────────────────────────────────
  const pullStartYRef = useRef<number | null>(null);
  const [pullProgress, setPullProgress] = useState(0); // 0–1
  const [pullTriggered, setPullTriggered] = useState(false);
  const PULL_THRESHOLD = 64;
  const hapticFiredRef = useRef(false);

  const isAtScrollTop = useCallback((el: HTMLDivElement) => {
    // Works universally: checks both the element and window scroll position
    return el.scrollTop <= 0 && window.scrollY <= 0;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    if (isAtScrollTop(el)) {
      pullStartYRef.current = e.touches[0]?.clientY ?? null;
      hapticFiredRef.current = false;
    }
  }, [isAtScrollTop]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartYRef.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - pullStartYRef.current;
    if (delta <= 0) { setPullProgress(0); return; }
    const progress = Math.min(delta / PULL_THRESHOLD, 1);
    setPullProgress(progress);
    // Fire haptic exactly once when crossing the threshold
    if (progress >= 1 && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      haptic.impact?.() ?? haptic.medium?.();
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullProgress >= 1 && !plaidRefreshing) {
      setPullTriggered(true);
      void handleRefreshPlaid().finally(() => setPullTriggered(false));
    }
    pullStartYRef.current = null;
    setPullProgress(0);
    hapticFiredRef.current = false;
  }, [pullProgress, plaidRefreshing, handleRefreshPlaid]);




  // ─── Early computations for Wealth Dashboard ─────────────────────
  // ── Unified Master Metrics (Vault Header Display) ──
  const netWorth = portfolioMetrics?.netWorth || 0;
  const totalCash = portfolioMetrics?.liquidCash || 0;
  const totalDebtBalance = (portfolioMetrics?.totalDebtBalance || 0) + (portfolioMetrics?.ccDebt || 0);
  const investTotalValue = portfolioMetrics?.totalInvestments || 0;
  const totalOtherAssets = portfolioMetrics?.totalOtherAssets || 0;
  const breakdownValueStyle = {
    fontSize: 16,
    fontWeight: 800,
    fontFamily: T.font.mono,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.02em",
    whiteSpace: "nowrap" as const,
    display: "block",
    lineHeight: 1.05,
  };

  // ── CREDIT UTILIZATION WIDGET (Moved to separate module) ──

  const headerSection = (
    <>
      {/* ─── Premium Wealth Dashboard Hero ─── */}
      <div style={{
        paddingTop: 20, paddingBottom: 24,
        display: "flex", flexDirection: "column", gap: 16,
        background: `linear-gradient(180deg, ${T.bg.card} 0%, transparent 100%)`,
        border: `1px solid ${T.border.subtle}`,
        borderRadius: T.radius.lg,
        padding: "20px 16px 24px",
        boxShadow: `0 16px 48px rgba(16,185,129,0.06), 0 8px 24px rgba(138,99,210,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 13, fontWeight: 700, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Total Net Worth
            </h1>
            <div style={{ fontSize: 36, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.02em", textShadow: `0 0 15px ${T.text.primary}80, 0 2px 10px ${T.text.primary}20` }}>
              {fmt(netWorth)}
            </div>
          </div>
          
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => openSheet()}
              className="hover-btn card-press"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 18,
                background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.bg.elevated})`,
                color: T.accent.primary,
                border: `1px solid ${T.accent.primary}40`,
                boxShadow: `0 2px 10px ${T.accent.primary}15`,
                cursor: "pointer",
                transition: "all .2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title="Add Account"
            >
              <Plus size={16} strokeWidth={2.5} color={T.accent.primary} />
            </button>
            {ENABLE_PLAID && (
              <button
                onClick={() => { haptic.medium(); void handlePlaidConnect(); }}
                disabled={plaidLoading}
                className="hover-btn card-press"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: T.bg.glass,
                  border: `1px solid ${T.border.subtle}`,
                  color: T.text.primary,
                  cursor: plaidLoading ? "wait" : "pointer",
                  opacity: plaidLoading ? 0.6 : 1,
                  transition: "all .2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                title="Plaid Sync"
              >
                {plaidLoading ? <Loader2 size={16} className="spin" color={T.text.primary} /> : <Link2 size={16} strokeWidth={2.5} color={T.text.primary} />}
              </button>
            )}
          </div>
        </div>

        {/* Wealth Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <div style={{ background: T.bg.elevated, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.md, padding: "12px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>Liquid Cash</div>
            <span style={{ ...breakdownValueStyle, color: T.accent.emerald }}>{fmt(totalCash)}</span>
          </div>
          <div style={{ background: T.bg.elevated, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.md, padding: "12px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>Investments</div>
            <span style={{ ...breakdownValueStyle, color: T.status.blue }}>{fmt(investTotalValue + totalOtherAssets)}</span>
          </div>
          <div style={{ background: T.bg.elevated, border: `1px solid ${T.border.subtle}`, borderRadius: T.radius.md, padding: "12px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>Liabilities</div>
            <span style={{ ...breakdownValueStyle, color: T.status.red }}>{fmt(Math.abs(totalDebtBalance))}</span>
          </div>
        </div>
      </div>

      {/* ─── Top Level Credit Health ─── */}
      <CreditUtilizationWidget />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 16,
          marginBottom: 8,
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {onViewTransactions && (
            <button
              onClick={() => { haptic.light(); onViewTransactions(); }}
              className="hover-btn"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 16, border: `1px solid ${T.accent.emerald}25`, background: `${T.accent.emerald}08`, color: T.accent.emerald, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all .2s", position: "relative" }}
            >
              <ReceiptText size={10} /> Ledger
              {!proEnabled && <div style={{ position: "absolute", top: -4, right: -4, fontSize: 7, fontWeight: 800, background: T.accent.primary, color: "#fff", padding: "1px 4px", borderRadius: 4, fontFamily: T.font.mono }}>PRO</div>}
            </button>
          )}
          {ENABLE_PLAID && (cards.some(c => c._plaidAccountId) || bankAccounts.some(b => b._plaidAccountId)) && (
            <button
              onClick={handleRefreshPlaid}
              disabled={plaidRefreshing}
              className="hover-btn"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 16, border: `1px solid ${T.status.blue}25`, background: `${T.status.blue}08`, color: T.status.blue, fontSize: 10, fontWeight: 700, cursor: plaidRefreshing ? "wait" : "pointer", transition: "all .2s" }}
            >
              <RefreshCw
                size={10}
                style={plaidRefreshing ? { animation: "spin .8s linear infinite", transformOrigin: "center" } : undefined}
              />
              {plaidRefreshing ? "Syncing..." : "Sync Plaid"}
            </button>
          )}
        </div>

        <button
          onClick={() => {
            const allCol = Object.values(collapsedSections).every(Boolean);
            setCollapsedSections({ creditCards: !allCol, bankAccounts: !allCol, savingsAccounts: !allCol, investments: !allCol, debts: !allCol, savingsGoals: !allCol, otherAssets: !allCol });
          }}
          className="hover-btn"
          style={{ border: "none", background: "transparent", color: T.text.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          {Object.values(collapsedSections).every(Boolean) ? "Expand All" : "Collapse All"}
        </button>
      </div>
    </>
  );

  const creditCardsSection = <CreditCardsSection collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} />;

  // Split bank accounts by type for separate sections

  // ─── Bank Accounts Section (Render) ──────────────────────────────────
  const bankAccountsSectionContent = <BankAccountsSection collapsedSections={collapsedSections} setCollapsedSections={setCollapsedSections} />;

  // ─── Investment Accounts Section (JSX) ─────────────────────────────────

  const investmentsSection = (
    <Suspense fallback={null}>
      <InvestmentsSection
        collapsedSections={collapsedSections}
        setCollapsedSections={setCollapsedSections}
      />
    </Suspense>
  );

  // ─── Transactions Section (JSX) ─────────────────────────────────────────

  const transactionsSection = (
    <Suspense fallback={null}>
      <TransactionsSection
        collapsedSections={collapsedSections}
        setCollapsedSections={setCollapsedSections}
        proEnabled={proEnabled}
      />
    </Suspense>
  );

  const combinedOtherAssetsSection = (
    <OtherAssetsSection
      collapsedSections={collapsedSections}
      setCollapsedSections={setCollapsedSections}
      openSheet={openSheet}
    />
  );

  return (
    <PortfolioContext.Provider value={demoOverrideContext}>
      <div
        className="page-body"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(pullProgress > 0.05 || pullTriggered) && (() => {
          const r = 13;
          const circ = 2 * Math.PI * r;
          const ready = pullProgress >= 1;
          const color = ready ? T.accent.emerald : T.accent.primary;
          return (
            <div style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: pullTriggered ? 44 : Math.max(Math.round(pullProgress * 44), 0),
              overflow: "hidden",
              transition: pullTriggered ? "height 0.2s" : "none",
              pointerEvents: "none",
              flexShrink: 0,
            }}>
              {pullTriggered ? (
                <RefreshCw size={18} color={T.accent.emerald} style={{ animation: "spin 0.8s linear infinite" }} />
              ) : (
                <svg width={32} height={32} viewBox="0 0 32 32" style={{ opacity: Math.max(pullProgress, 0.2) }}>
                  {/* Track */}
                  <circle cx={16} cy={16} r={r} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth={2.5} />
                  {/* Progress arc */}
                  <circle
                    cx={16} cy={16} r={r} fill="none"
                    stroke={color} strokeWidth={2.5}
                    strokeDasharray={`${pullProgress * circ} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 16 16)"
                    style={{ transition: "stroke 0.15s" }}
                  />
                  {ready && <circle cx={16} cy={16} r={5} fill={color} />}
                </svg>
              )}
            </div>
          );
        })()}
        <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
        <style>{`
            @keyframes spin { 100% { transform: rotate(360deg); } }
            .spin { animation: spin 1s linear infinite; }

            @keyframes sheetSlideUp {
                from { transform: translateY(100%); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes sheetFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes shimmerSlide {
                0%   { background-position: -200% center; }
                100% { background-position: 200% center; }
            }
            .hover-lift { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important; cursor: pointer; }
            .hover-lift:hover { transform: translateY(-3px) scale(1.01); box-shadow: 0 12px 32px rgba(0,0,0,0.3) !important; z-index: 5; }
        `}</style>

      {headerSection}
      {bankAccountsSectionContent}
      {creditCardsSection}
      {investmentsSection}
      {transactionsSection}
      {combinedOtherAssetsSection}

      {/* ═══ UNIFIED ADD BOTTOM SHEET ═══ */}
      {showAddSheet && (
        <Suspense fallback={null}>
          <AddAccountSheet
            show={showAddSheet}
            step={addSheetStep}
            onClose={closeSheet}
            onSetStep={setAddSheetStep}
            onAddCard={data => {
              haptic.success();
              setCards([
                ...cards,
                {
                  id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `card_${Date.now()}`,
                  ...data,
                  annualFeeDue: "",
                  annualFeeWaived: false,
                  notes: "",
                  apr: null,
                  hasPromoApr: false,
                  promoAprAmount: null,
                  promoAprExp: "",
                  statementCloseDay: null,
                  paymentDueDay: null,
                  minPayment: null,
                },
              ]);
              setCollapsedSections(p => ({ ...p, creditCards: false }));
            }}
            onAddBank={data => {
              haptic.success();
              setBankAccounts([
                ...bankAccounts,
                {
                  id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bank_${Date.now()}`,
                  ...data,
                },
              ]);
              setCollapsedSections(p => ({ ...p, bankAccounts: false }));
            }}
            onAddInvestment={(key, symbol, shares) => {
              const cur = financialConfig?.holdings || {};
              setFinancialConfig({
                ...financialConfig,
                holdings: { ...cur, [key]: [...(cur[key] || []), { symbol, shares }] },
              });
              setCollapsedSections(p => ({ ...p, investments: false }));
            }}
            onAddGoal={goal => {
              setFinancialConfig({ ...financialConfig, savingsGoals: [...(financialConfig?.savingsGoals || []), goal] });
              setCollapsedSections(p => ({ ...p, savingsGoals: false }));
            }}
            onAddDebt={debt => {
              setFinancialConfig({
                ...financialConfig,
                nonCardDebts: [...(financialConfig?.nonCardDebts || []), { id: "debt_" + Date.now(), ...debt }],
              });
              setCollapsedSections(p => ({ ...p, debts: false }));
            }}
            onAddAsset={asset => {
              setFinancialConfig({ ...financialConfig, otherAssets: [...(financialConfig?.otherAssets || []), asset] });
              setCollapsedSections(p => ({ ...p, otherAssets: false }));
            }}
            onPlaidConnect={() => {
              haptic.medium();
              void handlePlaidConnect();
            }}
            plaidLoading={plaidLoading}
            plaidResult={plaidResult}
            plaidError={plaidError}
            cardCatalog={cardCatalog}
          />
        </Suspense>
      )}
      </div>
      </div>
    </PortfolioContext.Provider>
  );
});
