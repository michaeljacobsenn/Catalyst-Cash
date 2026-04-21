  import type { Dispatch,SetStateAction } from "react";
  import { useEffect,useState } from "react";
  import { Mono } from "../components.js";
  import { T } from "../constants.js";
  import { ChevronDown,DollarSign } from "../icons";
  import { getHydratedStoredTransactions } from "../storedTransactions.js";
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
    proEnabled?: boolean;
}

export default function TransactionsSection({ collapsedSections, setCollapsedSections, proEnabled = false }: TransactionsSectionProps) {
    const [plaidTxns, setPlaidTxns] = useState<StoredTransaction[]>([]);

    useEffect(() => {
        const loadStoredTransactions = async () => {
            try {
                const stored = (await getHydratedStoredTransactions()) as StoredTransactionsPayload | null;
                if (stored?.data) setPlaidTxns(stored.data.slice(0, proEnabled ? 15 : 5));
            } catch {
                // Ignore local cache read failures.
            }
        };
        void loadStoredTransactions();
    }, [proEnabled]);

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
                    padding: "14px 18px",
                    borderRadius: 22,
                    cursor: "pointer",
                    userSelect: "none",
                    background: `linear-gradient(180deg, ${T.bg.glass}, ${T.bg.card})`,
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: `1px solid ${T.border.subtle}`,
                    boxShadow: `0 10px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.05)`,
                    transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1), color 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
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
                        style={{ fontSize: 10, color: T.text.secondary, borderColor: T.border.default, padding: "2px 7px", background: T.bg.elevated }}
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
                <Card animate variant="glass" style={{ padding: 0, overflow: "hidden", background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})` }}>
                    {plaidTxns.map((txn, i) => {
                        const isPositive = txn.amount < 0;
                        const merchant = txn.description || txn.name || "Unknown";
                        const amountColor = isPositive ? T.status.green : T.status.red;
                        return (
                            <div
                                key={i}
                                style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    padding: "12px 14px",
                                    borderBottom: i < plaidTxns.length - 1 ? `1px solid ${T.border.subtle}` : "none",
                                    background: i % 2 === 0 ? "transparent" : `${T.bg.surface}55`,
                                }}
                            >
                                <div
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 11,
                                        background: `${amountColor}12`,
                                        border: `1px solid ${amountColor}20`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                        marginTop: 1,
                                    }}
                                >
                                    <DollarSign size={14} color={amountColor} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 750,
                                            color: T.text.primary,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {merchant}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>{txn.date}</span>
                                        {txn.category && (
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    color: T.text.secondary,
                                                    padding: "2px 7px",
                                                    borderRadius: 999,
                                                    background: `${T.bg.surface}`,
                                                    border: `1px solid ${T.border.subtle}`,
                                                }}
                                            >
                                                {txn.category}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Mono
                                    size={12}
                                    weight={800}
                                    color={amountColor}
                                    style={{
                                        padding: "5px 8px",
                                        borderRadius: 999,
                                        background: `${amountColor}10`,
                                        border: `1px solid ${amountColor}20`,
                                        marginTop: 1,
                                    }}
                                >
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
