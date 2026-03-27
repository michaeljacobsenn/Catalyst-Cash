  import type { Dispatch,SetStateAction } from "react";
import { useEffect,useState } from "react";
  import type { BankAccount,CatalystCashConfig,PlaidInvestmentAccount,Card as PortfolioCard } from "../../types/index.js";
  import { T } from "../constants.js";
  import type { SetFinancialConfig } from "../contexts/SettingsContext.js";
  import { Building2,Plus,RefreshCw,Unplug } from "../icons";
  import { log } from "../logger.js";
  import {
    applyBalanceSync,
    connectBank,
    ensureConnectionAccountsPresent,
    fetchBalancesAndLiabilities,
    forceBackendSync,
    reconcilePlaidConnectionAccess,
    reconnectBank,
    removeConnection,
    saveConnectionLinks,
    setPreferredFreeConnectionId,
  } from "../plaid.js";
  import { Card,Label } from "../ui.js";

interface PlaidConnectionAccount {
  id?: string;
}

interface PlaidConnection {
  id: string;
  institutionName?: string;
  institutionLogo?: string;
  _needsReconnect?: boolean;
  _freeTierPaused?: boolean;
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
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<string | null>(null);
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

  const handleDisconnect = async (conn: PlaidConnection) => {
    // We already confirmed inline, just proceed to delete
    setConfirmingDisconnect(null);
    await removeConnection(conn.id);
    // Remove Plaid-imported cards/accounts that belonged to this connection
    const connId = conn.id;
    setCards(prev => prev.filter(c => c._plaidConnectionId !== connId));
    setBankAccounts(prev => prev.filter(b => b._plaidConnectionId !== connId));
    const plaidInvests = financialConfig?.plaidInvestments || [];
    const filteredInvests = plaidInvests.filter(i => i._plaidConnectionId !== connId);
    if (filteredInvests.length !== plaidInvests.length) {
      setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: filteredInvests });
    }
    await reloadConnections();
    setConnectionStatus(null);
    window.toast?.success?.("Connection and imported accounts removed");
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
        updatedCards: allCards,
        updatedBankAccounts: allBanks,
        updatedPlaidInvestments: allInvests,
        importedCards,
        importedBankAccounts,
        importedPlaidInvestments,
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
        importedCards: number;
        importedBankAccounts: number;
        importedPlaidInvestments: number;
      };
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

      const importedCount = importedCards + importedBankAccounts + importedPlaidInvestments;
      if (importedCount > 0) {
        setTimeout(() => {
          window.alert(
            `${importedCount} account${importedCount !== 1 ? "s" : ""} imported!\n\n` +
            'Plaid may assign generic names like "Credit Card" instead of the actual product name.\n\n' +
            "Please go to the Accounts tab and tap the ✏️ edit button on each imported account to verify and update:\n" +
            "• Card name (e.g. Sapphire Preferred)\n" +
            "• APR\n" +
            "• Annual fee & due date\n" +
            "• Statement close & payment due days"
          );
        }, 500);
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
        const forceSyncSucceeded = await forceBackendSync({ connectionId: conn.id });
        const refreshed = await fetchBalancesAndLiabilities(conn.id);
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
            importedCards: number;
            importedBankAccounts: number;
            importedPlaidInvestments: number;
          };
          const syncData = applyBalanceSync(
            refreshed,
            hydratedState.updatedCards,
            hydratedState.updatedBankAccounts,
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
            hydratedState.importedCards +
            hydratedState.importedBankAccounts +
            hydratedState.importedPlaidInvestments;
          if (restoredCount > 0) {
            window.toast?.info?.(
              `Restored ${restoredCount} ${restoredCount === 1 ? "linked account" : "linked accounts"} from ${conn.institutionName || "this bank"}.`
            );
          }
        } else if (!forceSyncSucceeded || refreshed?._pendingSync) {
          window.toast?.info?.(`${conn.institutionName || "This bank"} is now live. Fresh balances may take another moment to arrive.`);
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
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: T.radius.md,
            border: `1px solid ${T.status.red}25`,
            background: T.status.redDim,
            color: T.status.red,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {connectionStatus.message}
        </div>
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
                <button
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
          <div
            style={{
              padding: 16,
              borderRadius: T.radius.md,
              border: `1px dashed ${T.border.default}`,
              textAlign: "center",
              color: T.text.muted,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            No linked accounts yet.
          </div>
        ) : (
          [...plaidConnections]
            .sort((a, b) => (a.institutionName || "").localeCompare(b.institutionName || ""))
            .map(conn => (
              <div
                key={conn.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: T.radius.md,
                  background: T.bg.elevated,
                  border: `1px solid ${T.border.default}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
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
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text.primary, display: "block" }}>
                      {conn.institutionName || "Unknown Bank"}
                    </span>
                    <span style={{ fontSize: 11, color: T.text.muted, marginTop: 2, display: "block" }}>
                      {conn._freeTierPaused
                        ? "Paused on Free plan"
                        : hasFreeTierPausedConnections && activeFreeConnectionId === conn.id
                          ? "Active live sync on Free plan"
                        : conn._needsReconnect
                          ? "Reconnect required"
                          : `${conn.accounts?.length || 0} Accounts Linked`}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {conn._freeTierPaused && confirmingDisconnect !== conn.id && (
                    <button
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
                  {conn._needsReconnect && confirmingDisconnect !== conn.id && (
                    <button
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
                  {confirmingDisconnect === conn.id ? (
                    <>
                      <button
                        onClick={() => setConfirmingDisconnect(null)}
                        style={{
                          padding: "0 12px",
                          height: 36,
                          borderRadius: T.radius.sm,
                          border: `1px solid ${T.border.default}`,
                          background: T.bg.card,
                          color: T.text.secondary,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDisconnect(conn)}
                        style={{
                          padding: "0 12px",
                          height: 36,
                          borderRadius: T.radius.sm,
                          border: "none",
                          background: T.status.red,
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Confirm Delete
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmingDisconnect(conn.id)}
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
                  )}
                </div>
              </div>
            ))
        )}
      </div>

      <button
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
