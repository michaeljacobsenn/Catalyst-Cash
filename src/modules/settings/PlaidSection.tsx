  import type { Dispatch,SetStateAction } from "react";
import { useEffect,useState } from "react";
  import type { BankAccount,CatalystCashConfig,PlaidInvestmentAccount,Card as PortfolioCard } from "../../types/index.js";
  import { T } from "../constants.js";
  import type { SetFinancialConfig } from "../contexts/SettingsContext.js";
  import { Building2,Plus,RefreshCw,Unplug } from "../icons";
import { log } from "../logger.js";
import { reviewPlaidDuplicateCandidates } from "../plaidDuplicateResolution.js";
  import {
    applyBalanceSync,
    connectBank,
    disconnectConnectionPortfolioRecords,
    ensureConnectionAccountsPresent,
    fetchBalancesAndLiabilities,
    forceBackendSync,
    purgeStoredTransactionsForConnection,
    reconcilePlaidConnectionAccess,
    reconnectBank,
    removeConnection,
    saveConnectionLinks,
    setPreferredFreeConnectionId,
  } from "../plaid.js";
  import { Card,Label,ListRow,ListSection,NoticeBanner } from "../ui.js";

interface PlaidConnectionAccount {
  id?: string;
}

interface PlaidConnection {
  id: string;
  institutionName?: string;
  institutionLogo?: string;
  _needsReconnect?: boolean;
  _freeTierPaused?: boolean;
  _pendingSync?: boolean;
  _error?: string;
  _syncStatus?: string;
  accounts?: PlaidConnectionAccount[];
}

interface PlaidSectionProps {
  cards: PortfolioCard[];
  setCards: Dispatch<SetStateAction<PortfolioCard[]>>;
  bankAccounts: BankAccount[];
  setBankAccounts: Dispatch<SetStateAction<BankAccount[]>>;
  financialConfig?: CatalystCashConfig | null;
  setFinancialConfig: SetFinancialConfig;
  cardCatalog: unknown;
}

interface BalanceSyncResult {
  updatedCards: PortfolioCard[];
  updatedBankAccounts: BankAccount[];
  updatedPlaidInvestments?: PlaidInvestmentAccount[];
  balanceSummary: unknown;
}

interface DisconnectPromptState {
  id: string;
  keepManualDefault?: boolean;
}

export default function PlaidSection({
  cards,
  setCards,
  bankAccounts,
  setBankAccounts,
  financialConfig,
  setFinancialConfig,
  cardCatalog,
}: PlaidSectionProps) {
  const spinningIconStyle = { animation: "spin .8s linear infinite", transformOrigin: "center" } as const;
  const [plaidConnections, setPlaidConnections] = useState<PlaidConnection[]>([]);
  const [isPlaidConnecting, setIsPlaidConnecting] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [switchingActiveId, setSwitchingActiveId] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<DisconnectPromptState | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ tone: "error" | "info"; message: string } | null>(null);
  const [activeFreeConnectionId, setActiveFreeConnectionId] = useState<string | null>(null);
  const [hasFreeTierPausedConnections, setHasFreeTierPausedConnections] = useState(false);
  const reconnectQueue = plaidConnections.filter((connection) => connection?._needsReconnect);

  const reloadConnections = async () => {
    const accessState = await reconcilePlaidConnectionAccess(cards, bankAccounts);
    if (accessState.cardsChanged) setCards(accessState.updatedCards);
    if (accessState.bankAccountsChanged) setBankAccounts(accessState.updatedBankAccounts);
    setPlaidConnections(accessState.connections || []);
    setActiveFreeConnectionId(accessState.activeFreeConnectionId || null);
    setHasFreeTierPausedConnections(accessState.pausedConnectionIds.length > 0);
    return accessState;
  };

  // Load connections on mount
  useEffect(() => {
    reloadConnections().catch(() => {});
  }, []);

  const handleDisconnect = async (conn: PlaidConnection, options: { keepManual: boolean }) => {
    const keepManual = options.keepManual === true;
    setConfirmingDisconnect(null);
    setDisconnectingId(conn.id);
    try {
      await removeConnection(conn.id);
      const plaidInvests = financialConfig?.plaidInvestments || [];
      const disconnectedState = disconnectConnectionPortfolioRecords(
        conn,
        cards,
        bankAccounts,
        plaidInvests,
        { removeLinkedRecords: !keepManual }
      );

      if (disconnectedState.cardsChanged) {
        setCards(disconnectedState.updatedCards);
      }
      if (disconnectedState.bankAccountsChanged) {
        setBankAccounts(disconnectedState.updatedBankAccounts);
      }
      if (disconnectedState.plaidInvestmentsChanged) {
        setFinancialConfig({
          type: "SET_FIELD",
          field: "plaidInvestments",
          value: disconnectedState.updatedPlaidInvestments,
        });
      }

      await purgeStoredTransactionsForConnection(conn).catch(() => 0);
      await reloadConnections();
      setConnectionStatus(
        keepManual
          ? {
              tone: "info",
              message: `${conn.institutionName || "This bank"} was disconnected. Linked cards and cash accounts were kept as manual records. Auto-tracked investment balances were removed.`,
            }
          : null
      );
      window.toast?.success?.(
        keepManual
          ? "Disconnected. Linked accounts kept for manual handling."
          : "Disconnected and removed from Portfolio."
      );
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleConnect = async () => {
    if (isPlaidConnecting) return;
    setConnectionStatus(null);
    setIsPlaidConnecting(true);
    try {
      await connectBank(
        async connection => {
          await finalizeConnection(connection, "Bank linked successfully!");
        },
        (err: unknown) => {
          void log.error("plaid", "Bank link flow failed", err);
          const msg = err instanceof Error ? err.message : "Failed to link bank";
          if (msg === "cancelled") return;
          setConnectionStatus({ tone: "error", message: msg });
          window.toast?.error?.(msg);
        }
      );
    } catch (err) {
      void log.error("plaid", "Plaid initialization failed", err);
      const message = err instanceof Error ? err.message : "Failed to initialize Plaid";
      setConnectionStatus({ tone: "error", message });
      window.toast?.error?.(message);
    } finally {
      setIsPlaidConnecting(false);
    }
  };

  const finalizeConnection = async (connection: PlaidConnection, successToast: string) => {
    try {
      const plaidInvestments = financialConfig?.plaidInvestments || [];
      const {
        updatedCards: hydratedCards,
        updatedBankAccounts: hydratedBanks,
        updatedPlaidInvestments: allInvests,
        importedPlaidInvestments,
        duplicateCandidates = [],
      } = ensureConnectionAccountsPresent(
        connection,
        cards,
        bankAccounts,
        cardCatalog as null | undefined,
        plaidInvestments
      ) as {
        updatedCards: PortfolioCard[];
        updatedBankAccounts: BankAccount[];
        updatedPlaidInvestments: PlaidInvestmentAccount[];
        importedPlaidInvestments: number;
        duplicateCandidates: Array<{
          kind: "card" | "bank";
          plaidAccountId: string;
          importedId: string;
          importedLabel: string;
          institution: string;
          existingIds: string[];
        }>;
      };
      const duplicateReview = reviewPlaidDuplicateCandidates({
        connection,
        newCards: hydratedCards.filter((card) => !cards.some((existing) => existing.id === card.id)),
        newBankAccounts: hydratedBanks.filter((account) => !bankAccounts.some((existing) => existing.id === account.id)),
        duplicateCandidates,
        cards,
        bankAccounts,
      });
      const allCards = [...cards, ...duplicateReview.newCards];
      const allBanks = [...bankAccounts, ...duplicateReview.newBankAccounts];
      await saveConnectionLinks(connection);

      setCards(allCards);
      setBankAccounts(allBanks);
      if (importedPlaidInvestments > 0) {
        setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: allInvests });
      }

      try {
        const refreshed = await fetchBalancesAndLiabilities(connection.id);
        if (refreshed) {
          const syncData = applyBalanceSync(refreshed, allCards, allBanks, allInvests) as BalanceSyncResult;
          setCards(syncData.updatedCards);
          setBankAccounts(syncData.updatedBankAccounts);
          if (syncData.updatedPlaidInvestments) {
            setFinancialConfig({
              type: "SET_FIELD",
              field: "plaidInvestments",
              value: syncData.updatedPlaidInvestments,
            });
          }
          await saveConnectionLinks(refreshed);
        }
      } catch (balErr) {
        const message = balErr instanceof Error ? balErr.message : String(balErr);
        void log.warn("plaid", "Balance fetch after connect failed", { message });
        window.toast?.info?.("Connected. If balances do not refresh yet, tap Sync after the backend finishes updating.");
      }

      await reloadConnections();
      setConnectionStatus(null);
      window.toast?.success?.(successToast);

      const importedCount =
        duplicateReview.newCards.length +
        duplicateReview.newBankAccounts.length +
        importedPlaidInvestments;
      const ambiguousDuplicateCount = duplicateReview.ambiguousCount;
      if (importedCount > 0) {
        setTimeout(() => {
          window.alert(
            `${importedCount} account${importedCount !== 1 ? "s" : ""} imported!\n\n` +
            'Plaid may assign generic names like "Credit Card" instead of the actual product name.\n\n' +
            "Please go to the Accounts tab and tap the Edit button on each imported account to verify and update:\n" +
            "• Card name (e.g. Sapphire Preferred)\n" +
            "• APR\n" +
            "• Annual fee & due date\n" +
            "• Statement close & payment due days"
          );
        }, 500);
      }
      if (ambiguousDuplicateCount > 0) {
        setTimeout(() => {
          window.alert(
            `${ambiguousDuplicateCount} imported account${ambiguousDuplicateCount !== 1 ? "s may" : " may"} overlap existing records, but the match was ambiguous.\n\nCatalyst kept them separate so nothing was merged automatically. Review them in Portfolio and keep or remove the duplicates you want.`
          );
        }, importedCount > 0 ? 900 : 500);
      }
    } catch (err) {
      void log.error("plaid", "Post-connect processing failed", err);
    }
  };

  const handleReconnect = async (conn: PlaidConnection) => {
    if (reconnectingId) return;
    setConnectionStatus(null);
    setReconnectingId(conn.id);
    try {
      await reconnectBank(
        conn,
        async connection => {
          await finalizeConnection(connection, `${connection.institutionName || "Bank"} reconnected successfully!`);
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to reconnect bank";
          if (message === "cancelled") return;
          setConnectionStatus({ tone: "error", message });
          window.toast?.error?.(message);
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reconnect bank";
      setConnectionStatus({ tone: "error", message });
      window.toast?.error?.(message);
    } finally {
      setReconnectingId(null);
      await reloadConnections();
    }
  };

  const handleKeepLive = async (conn: PlaidConnection) => {
    if (!conn?.id || switchingActiveId) return;
    setSwitchingActiveId(conn.id);
    try {
      await setPreferredFreeConnectionId(conn.id);
      const accessState = await reloadConnections();
      const baseCards = accessState.cardsChanged ? accessState.updatedCards : cards;
      const baseBankAccounts = accessState.bankAccountsChanged ? accessState.updatedBankAccounts : bankAccounts;
      const basePlaidInvestments = financialConfig?.plaidInvestments || [];

      try {
        const forceSyncResult = await forceBackendSync({ connectionId: conn.id });
        const forceSyncSucceeded = Boolean(forceSyncResult?.success);
        const refreshed = await fetchBalancesAndLiabilities(conn.id) as PlaidConnection | null;
        if (refreshed && !refreshed._error && !refreshed._pendingSync) {
          const hydratedState = ensureConnectionAccountsPresent(
            refreshed,
            baseCards,
            baseBankAccounts,
            cardCatalog as null | undefined,
            basePlaidInvestments
          ) as {
            updatedCards: PortfolioCard[];
            updatedBankAccounts: BankAccount[];
            updatedPlaidInvestments: PlaidInvestmentAccount[];
            importedPlaidInvestments: number;
            duplicateCandidates: Array<{
              kind: "card" | "bank";
              plaidAccountId: string;
              importedId: string;
              importedLabel: string;
              institution: string;
              existingIds: string[];
            }>;
          };
          const duplicateReview = reviewPlaidDuplicateCandidates({
            connection: refreshed,
            newCards: hydratedState.updatedCards.filter((card) => !baseCards.some((existing) => existing.id === card.id)),
            newBankAccounts: hydratedState.updatedBankAccounts.filter((account) => !baseBankAccounts.some((existing) => existing.id === account.id)),
            duplicateCandidates: hydratedState.duplicateCandidates || [],
            cards: baseCards,
            bankAccounts: baseBankAccounts,
          });
          const mergedCards = [...baseCards, ...duplicateReview.newCards];
          const mergedBanks = [...baseBankAccounts, ...duplicateReview.newBankAccounts];
          const syncData = applyBalanceSync(
            refreshed,
            mergedCards,
            mergedBanks,
            hydratedState.updatedPlaidInvestments
          ) as BalanceSyncResult;
          setCards(syncData.updatedCards);
          setBankAccounts(syncData.updatedBankAccounts);
          if (syncData.updatedPlaidInvestments) {
            setFinancialConfig({
              type: "SET_FIELD",
              field: "plaidInvestments",
              value: syncData.updatedPlaidInvestments,
            });
          }
          await saveConnectionLinks(refreshed);
          const restoredCount =
            duplicateReview.newCards.length +
            duplicateReview.newBankAccounts.length +
            hydratedState.importedPlaidInvestments;
          if (restoredCount > 0) {
            window.toast?.info?.(
              `Restored ${restoredCount} ${restoredCount === 1 ? "linked account" : "linked accounts"} from ${conn.institutionName || "this bank"}.`
            );
          }
          if (duplicateReview.ambiguousCount > 0) {
            window.toast?.info?.(
              `${duplicateReview.ambiguousCount} possible duplicate account${duplicateReview.ambiguousCount === 1 ? "" : "s"} were kept separate for review in Portfolio.`
            );
          }
        } else if (!forceSyncSucceeded || refreshed?._pendingSync) {
          window.toast?.info?.(
            forceSyncResult?.message || `${conn.institutionName || "This bank"} is now live. Fresh balances may take another moment to arrive.`
          );
        }
      } catch (error) {
        void log.warn("plaid", "Active live bank refresh did not complete immediately", {
          connectionId: conn.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      setConnectionStatus({
        tone: "info",
        message: `${conn.institutionName || "This bank"} is now your active live-sync institution on Free. Other linked banks stay available as manual snapshots.`,
      });
      window.toast?.success?.(`${conn.institutionName || "Bank"} kept as your live sync institution`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not switch active bank";
      setConnectionStatus({ tone: "error", message });
      window.toast?.error?.(message);
    } finally {
      setSwitchingActiveId(null);
    }
  };

  return (
    <Card style={{ borderLeft: `3px solid ${T.status.purple || "#8a2be2"}40` }}>
      <Label>Bank Connections</Label>
      <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.6, marginBottom: 16 }}>
        Securely link your bank and credit card accounts to automatically fetch balances. Plaid access tokens stay on
        the Worker; this device stores metadata only.
      </p>

      {connectionStatus && (
        <NoticeBanner
          tone={connectionStatus.tone === "error" ? "error" : "info"}
          compact
          style={{ marginBottom: 14 }}
          title={connectionStatus.tone === "error" ? "Connection Issue" : "Connection Update"}
          message={connectionStatus.message}
        />
      )}

      {reconnectQueue.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: "14px 14px 12px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.status.amber}35`,
            background: `${T.status.amber}10`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.status.amber, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Reconnect Queue
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary, marginTop: 4 }}>
                {reconnectQueue.length} linked institution{reconnectQueue.length === 1 ? "" : "s"} need attention
              </div>
            </div>
            <span style={{ fontSize: 11, color: T.text.secondary, fontFamily: T.font.mono }}>
              Restore-safe placeholders active
            </span>
          </div>
          <p style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.55, margin: "0 0 10px" }}>
            Your cards and accounts stay visible while these banks are offline. Reconnect each institution below to resume live balances and transactions.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reconnectQueue.map((conn) => (
              <div
                key={`queue-${conn.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: T.bg.card,
                  border: `1px solid ${T.border.subtle}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>
                    {conn.institutionName || "Linked bank"}
                  </div>
                  <div style={{ fontSize: 11, color: T.text.dim, marginTop: 2 }}>
                    {(conn.accounts?.length || 0)} reconnect-ready account{(conn.accounts?.length || 0) === 1 ? "" : "s"}
                  </div>
                </div>
                <button type="button"
                  onClick={() => handleReconnect(conn)}
                  disabled={reconnectingId === conn.id}
                  style={{
                    padding: "0 12px",
                    height: 34,
                    borderRadius: T.radius.sm,
                    border: `1px solid ${T.accent.primary}35`,
                    background: `${T.accent.primary}14`,
                    color: T.accent.primary,
                    cursor: reconnectingId === conn.id ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: reconnectingId === conn.id ? 0.7 : 1,
                  }}
                >
                  {reconnectingId === conn.id ? <RefreshCw size={14} style={spinningIconStyle} /> : <RefreshCw size={14} />}
                  {reconnectingId === conn.id ? "Reconnecting..." : "Reconnect"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {plaidConnections.length === 0 ? (
          <NoticeBanner
            tone="info"
            title="No linked accounts yet."
            message="Link a bank once and Catalyst will keep balances, cards, and transactions synced without manual re-entry."
          />
        ) : (
          <ListSection>
            {[...plaidConnections]
              .sort((a, b) => (a.institutionName || "").localeCompare(b.institutionName || ""))
              .map((conn, index, arr) => {
                const isDisconnectPromptOpen = confirmingDisconnect?.id === conn.id;
                const isLast = index === arr.length - 1;

                return (
                  <div
                    key={conn.id}
                    style={{
                      borderBottom: isLast ? "none" : `1px solid ${T.border.subtle}`,
                    }}
                  >
                    <ListRow
                      isLast
                      icon={
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            boxShadow: "0 8px 14px rgba(0,0,0,0.08)",
                          }}
                        >
                          {conn.institutionLogo ? (
                            <img
                              src={`data:image/png;base64,${conn.institutionLogo}`}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <Building2 size={16} color="#000" />
                          )}
                        </div>
                      }
                      title={conn.institutionName || "Unknown Bank"}
                      description={
                        conn._freeTierPaused
                          ? "Paused on Free plan"
                          : hasFreeTierPausedConnections && activeFreeConnectionId === conn.id
                            ? "Active live sync on Free plan"
                            : conn._needsReconnect
                              ? "Reconnect required"
                              : `${conn.accounts?.length || 0} linked account${(conn.accounts?.length || 0) === 1 ? "" : "s"}`
                      }
                      action={
                        isDisconnectPromptOpen ? null : (
                          <div style={{ display: "flex", gap: 8 }}>
                            {conn._freeTierPaused && (
                              <button type="button"
                                onClick={() => handleKeepLive(conn)}
                                disabled={switchingActiveId === conn.id}
                                aria-label={`Keep ${conn.institutionName || "bank"} as your active live sync institution`}
                                style={{
                                  padding: "0 12px",
                                  height: 36,
                                  borderRadius: T.radius.sm,
                                  border: `1px solid ${T.accent.emerald}35`,
                                  background: `${T.accent.emerald}12`,
                                  color: T.accent.emerald,
                                  cursor: switchingActiveId === conn.id ? "not-allowed" : "pointer",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  opacity: switchingActiveId === conn.id ? 0.7 : 1,
                                }}
                              >
                                {switchingActiveId === conn.id ? <RefreshCw size={14} style={spinningIconStyle} /> : null}
                                {switchingActiveId === conn.id ? "Applying..." : "Keep Live"}
                              </button>
                            )}
                            {conn._needsReconnect && (
                              <button type="button"
                                onClick={() => handleReconnect(conn)}
                                disabled={reconnectingId === conn.id || conn._freeTierPaused}
                                aria-label={`Reconnect ${conn.institutionName || "bank"}`}
                                style={{
                                  padding: "0 12px",
                                  height: 36,
                                  borderRadius: T.radius.sm,
                                  border: `1px solid ${T.accent.primary}35`,
                                  background: `${T.accent.primary}14`,
                                  color: T.accent.primary,
                                  cursor: reconnectingId === conn.id || conn._freeTierPaused ? "not-allowed" : "pointer",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  opacity: reconnectingId === conn.id || conn._freeTierPaused ? 0.7 : 1,
                                }}
                              >
                                {reconnectingId === conn.id ? (
                                  <RefreshCw size={14} style={spinningIconStyle} />
                                ) : (
                                  <RefreshCw size={14} />
                                )}
                                {reconnectingId === conn.id ? "Reconnecting..." : "Reconnect"}
                              </button>
                            )}
                            <button type="button"
                              onClick={() => setConfirmingDisconnect({ id: conn.id })}
                              aria-label={`Disconnect ${conn.institutionName || "bank"}`}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: T.status.redDim,
                                color: T.status.red,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Unplug size={16} />
                            </button>
                          </div>
                        )
                      }
                    />

                    {isDisconnectPromptOpen && (
                      <div
                        style={{
                          margin: "0 12px 12px",
                          padding: "14px 14px 12px",
                          borderRadius: 14,
                          border: `1px solid ${T.status.red}22`,
                          background: `linear-gradient(180deg, ${T.bg.card} 0%, ${T.bg.elevated} 100%)`,
                          boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: T.text.primary, marginBottom: 4 }}>
                          Disconnect {conn.institutionName || "this bank"}?
                        </div>
                        <div style={{ fontSize: 11, lineHeight: 1.5, color: T.text.secondary, marginBottom: 12 }}>
                          Keep Manual preserves the linked cards and cash accounts as editable manual records. Remove Accounts deletes the linked portfolio records for this bank.
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <button type="button"
                              onClick={() => setConfirmingDisconnect(null)}
                              disabled={disconnectingId === conn.id}
                              style={{
                                minHeight: 38,
                                padding: "0 12px",
                                borderRadius: T.radius.sm,
                                border: `1px solid ${T.border.default}`,
                                background: T.bg.card,
                                color: T.text.secondary,
                                cursor: disconnectingId === conn.id ? "not-allowed" : "pointer",
                                fontSize: 12,
                                fontWeight: 600,
                                opacity: disconnectingId === conn.id ? 0.6 : 1,
                              }}
                            >
                              Cancel
                            </button>
                            <button type="button"
                              onClick={() => handleDisconnect(conn, { keepManual: true })}
                              disabled={disconnectingId === conn.id}
                              style={{
                                minHeight: 38,
                                padding: "0 12px",
                                borderRadius: T.radius.sm,
                                border: `1px solid ${T.accent.primary}30`,
                                background: `${T.accent.primary}12`,
                                color: T.accent.primary,
                                cursor: disconnectingId === conn.id ? "not-allowed" : "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                                opacity: disconnectingId === conn.id ? 0.6 : 1,
                              }}
                            >
                              {disconnectingId === conn.id ? "Disconnecting..." : "Keep Manual"}
                            </button>
                          </div>
                          <button type="button"
                            onClick={() => handleDisconnect(conn, { keepManual: false })}
                            disabled={disconnectingId === conn.id}
                            style={{
                              minHeight: 40,
                              padding: "0 14px",
                              borderRadius: T.radius.sm,
                              border: "none",
                              background: T.status.red,
                              color: "white",
                              cursor: disconnectingId === conn.id ? "not-allowed" : "pointer",
                              fontSize: 12,
                              fontWeight: 800,
                              opacity: disconnectingId === conn.id ? 0.6 : 1,
                            }}
                          >
                            {disconnectingId === conn.id ? "Disconnecting..." : "Remove Accounts"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </ListSection>
        )}
      </div>

      <button type="button"
        onClick={handleConnect}
        disabled={isPlaidConnecting || !!reconnectingId}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: T.radius.md,
          border: "none",
          background: T.accent.primary,
          color: "white",
          fontSize: 14,
          fontWeight: 700,
          cursor: isPlaidConnecting || reconnectingId ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: isPlaidConnecting || reconnectingId ? 0.7 : 1,
          transition: "opacity .2s",
        }}
      >
        {isPlaidConnecting ? <RefreshCw size={18} style={spinningIconStyle} /> : <Plus size={18} />}
        {isPlaidConnecting ? "Connecting..." : "Link New Bank"}
      </button>
    </Card>
  );
}
