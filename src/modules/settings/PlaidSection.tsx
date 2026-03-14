import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CatalystCashConfig, BankAccount, Card as PortfolioCard, PlaidInvestmentAccount } from "../../types/index.js";
import type { SetFinancialConfig } from "../contexts/SettingsContext.js";
import { T } from "../constants.js";
import { Card, Label } from "../ui.js";
import { Plus, Building2, Unplug, Loader2 } from "lucide-react";
import {
  getConnections,
  removeConnection,
  connectBank,
  autoMatchAccounts,
  fetchBalancesAndLiabilities,
  applyBalanceSync,
  saveConnectionLinks,
} from "../plaid.js";

interface PlaidConnectionAccount {
  id?: string;
}

interface PlaidConnection {
  id: string;
  institutionName?: string;
  institutionLogo?: string;
  _needsReconnect?: boolean;
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

function mergeUniqueById<T extends { id?: string | null }>(existing: T[] = [], incoming: T[] = []) {
  const ids = new Set(existing.map(e => e.id).filter(Boolean));
  return [...existing, ...incoming.filter(i => i.id && !ids.has(i.id))];
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
  const [plaidConnections, setPlaidConnections] = useState<PlaidConnection[]>([]);
  const [isPlaidConnecting, setIsPlaidConnecting] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ tone: "error" | "info"; message: string } | null>(null);

  // Load connections on mount
  useEffect(() => {
    getConnections()
      .then(c => setPlaidConnections(c || []))
      .catch(() => { });
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
    setPlaidConnections(await getConnections());
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
          try {
            const plaidInvestments = financialConfig?.plaidInvestments || [];
            const { newCards, newBankAccounts, newPlaidInvestments } = autoMatchAccounts(
              connection,
              cards,
              bankAccounts,
              cardCatalog as null | undefined,
              plaidInvestments
            ) as { newCards: PortfolioCard[]; newBankAccounts: BankAccount[]; newPlaidInvestments: PlaidInvestmentAccount[] };
            await saveConnectionLinks(connection);

            const allCards = mergeUniqueById(cards, newCards);
            const allBanks = mergeUniqueById(bankAccounts, newBankAccounts);
            const allInvests = mergeUniqueById(plaidInvestments, newPlaidInvestments);
            setCards(allCards);
            setBankAccounts(allBanks);
            if (newPlaidInvestments.length > 0) {
              setFinancialConfig({ type: "SET_FIELD", field: "plaidInvestments", value: allInvests });
            }

            // Fetch live balances (best-effort)
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
              console.error("[Plaid] Balance fetch after connect failed:", message);
              window.toast?.info?.("Connected! Tap Sync to fetch balances.");
            }

            setPlaidConnections(await getConnections());
            setConnectionStatus(null);
            window.toast?.success?.("Bank linked successfully!");

            // Prompt user to review imported accounts
            const importedCount = newCards.length + newBankAccounts.length + newPlaidInvestments.length;
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
            console.error("[Plaid] Post-connect processing error:", err);
          }
        },
        (err: unknown) => {
          console.error(err);
          const msg = err instanceof Error ? err.message : "Failed to link bank";
          if (msg === "cancelled") return;
          setConnectionStatus({ tone: "error", message: msg });
          window.toast?.error?.(msg);
        }
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to initialize Plaid";
      setConnectionStatus({ tone: "error", message });
      window.toast?.error?.(message);
    } finally {
      setIsPlaidConnecting(false);
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
                      {conn._needsReconnect ? "Reconnect required" : `${conn.accounts?.length || 0} Accounts Linked`}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
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
        disabled={isPlaidConnecting}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: T.radius.md,
          border: "none",
          background: T.accent.primary,
          color: "white",
          fontSize: 14,
          fontWeight: 700,
          cursor: isPlaidConnecting ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: isPlaidConnecting ? 0.7 : 1,
          transition: "opacity .2s",
        }}
      >
        {isPlaidConnecting ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
        {isPlaidConnecting ? "Connecting..." : "Link New Bank"}
      </button>
    </Card>
  );
}
