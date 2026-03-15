  import type { Dispatch,SetStateAction } from "react";
  import { useEffect,useState } from "react";
  import { Mono } from "../components.js";
  import { T } from "../constants.js";
  import { ChevronDown,DollarSign } from "../icons";
  import { getStoredTransactions } from "../plaid.js";
  import { Badge,Card } from "../ui.js";
  import type { PortfolioCollapsedSections } from "./types.js";

interface StoredTransaction {
    id?: string;
    amount: number;
    description?: string;
    name?: string;
    date: string;
    category?: string;
}

interface StoredTransactionsPayload {
    data: StoredTransaction[];
    fetchedAt: string;
}

interface TransactionsSectionProps {
    collapsedSections: PortfolioCollapsedSections;
    setCollapsedSections: Dispatch<SetStateAction<PortfolioCollapsedSections>>;
}

export default function TransactionsSection({ collapsedSections, setCollapsedSections }: TransactionsSectionProps) {
    const [plaidTxns, setPlaidTxns] = useState<StoredTransaction[]>([]);

    useEffect(() => {
        const loadStoredTransactions = async () => {
            try {
                const stored = (await getStoredTransactions()) as StoredTransactionsPayload | null;
                if (stored?.data) setPlaidTxns(stored.data.slice(0, 15));
            } catch {
                // Ignore local cache read failures.
            }
        };
        void loadStoredTransactions();
    }, []);

    if (plaidTxns.length === 0) return null;

    return (
        <div style={{ marginTop: 16 }}>
            <div
                onClick={() => setCollapsedSections(p => ({ ...p, transactions: !p.transactions }))}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 8,
                    marginBottom: collapsedSections.transactions ? 8 : 16,
                    padding: "16px 20px",
                    borderRadius: 24,
                    cursor: "pointer",
                    userSelect: "none",
                    background: T.bg.glass,
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid ${T.border.subtle}`,
                    boxShadow: `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.05)`,
                    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            >
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: `${T.status.blue}1A`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: `0 0 12px ${T.status.blue}10`,
                    }}
                >
                    <DollarSign size={14} color={T.status.blue} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                    Recent Transactions
                </h2>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge
                        variant="outline"
                        style={{ fontSize: 10, color: T.text.secondary, borderColor: T.border.default, padding: "1px 6px" }}
                    >
                        {plaidTxns.length}
                    </Badge>
                    <ChevronDown
                        size={16}
                        color={T.text.muted}
                        className="chevron-animated"
                        data-open={String(!collapsedSections.transactions)}
                    />
                </div>
            </div>

            {!collapsedSections.transactions && (
                <Card animate variant="glass" style={{ padding: 0, overflow: "hidden" }}>
                    {plaidTxns.map((txn, i) => {
                        const isPositive = txn.amount < 0;
                        return (
                            <div
                                key={i}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 14px",
                                    borderBottom: i < plaidTxns.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: T.text.primary,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {txn.description || txn.name || "Unknown"}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                        <span style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>{txn.date}</span>
                                        {txn.category && (
                                            <span
                                                style={{
                                                    fontSize: 8,
                                                    color: T.text.dim,
                                                    padding: "1px 5px",
                                                    borderRadius: 4,
                                                    background: `${T.border.default}40`,
                                                }}
                                            >
                                                {txn.category}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Mono size={11} weight={800} color={isPositive ? T.status.green : T.text.primary}>
                                    {isPositive ? "+" : "-"}${Math.abs(txn.amount).toFixed(2)}
                                </Mono>
                            </div>
                        );
                    })}
                </Card>
            )}
        </div>
    );
}
