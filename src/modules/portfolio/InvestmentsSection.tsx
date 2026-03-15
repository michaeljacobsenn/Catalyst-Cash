  import type { Dispatch,SetStateAction } from "react";
  import { useCallback,useEffect,useMemo,useState } from "react";
  import type { CatalystCashConfig,InvestmentBucket,InvestmentHolding,InvestmentHoldings,MarketPriceMap,PlaidInvestmentAccount } from "../../types/index.js";
  import { Mono } from "../components.js";
  import { T } from "../constants.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { useSettings } from "../contexts/SettingsContext.js";
  import { ChevronDown,RefreshCw,Trash2,TrendingUp } from "../icons";
  import { fetchMarketPrices,getManualMarketRefreshStatus } from "../marketData.js";
  import { Badge,Card } from "../ui.js";
  import { fmt } from "../utils.js";
  import type { PortfolioCollapsedSections } from "./types.js";

interface InvestmentsSectionProps {
    collapsedSections: PortfolioCollapsedSections;
    setCollapsedSections: Dispatch<SetStateAction<PortfolioCollapsedSections>>;
}

interface InvestmentSectionMeta {
    key: InvestmentBucket;
    label: string;
    enabled: boolean;
    color: string;
}

export default function InvestmentsSection({ collapsedSections, setCollapsedSections }: InvestmentsSectionProps) {
    const { financialConfig, setFinancialConfig } = useSettings();
    const { marketPrices, setMarketPrices } = usePortfolio();

    const holdings: InvestmentHoldings = financialConfig?.holdings || { roth: [], k401: [], brokerage: [], crypto: [], hsa: [] };
    const investmentSections: InvestmentSectionMeta[] = [
        { key: "roth", label: "Roth IRA", enabled: !!financialConfig?.trackRothContributions, color: T.accent.primary },
        { key: "k401", label: "401(k)", enabled: !!financialConfig?.track401k, color: T.status.blue },
        { key: "brokerage", label: "Brokerage", enabled: !!financialConfig?.trackBrokerage, color: T.accent.emerald },
        { key: "hsa", label: "HSA", enabled: !!financialConfig?.trackHSA, color: "#06B6D4" },
        {
            key: "crypto",
            label: "Crypto",
            enabled: financialConfig?.trackCrypto !== false && (holdings.crypto?.length ?? 0) > 0,
            color: T.status.amber,
        },
    ];

    const enabledInvestments = investmentSections.filter(s => s.enabled || (holdings[s.key] || []).length > 0);

    const allHoldingSymbols = useMemo(() => {
        const syms = new Set<string>();
        (Object.values(holdings).flat().filter(Boolean) as InvestmentHolding[]).forEach((h) => {
                if (h?.symbol) syms.add(h.symbol);
        });
        return [...syms];
    }, [holdings]);

    const [investPrices, setInvestPrices] = useState<MarketPriceMap>(marketPrices || {});
    const [collapsedInvest, setCollapsedInvest] = useState<Record<string, boolean>>({});
    const [refreshingPrices, setRefreshingPrices] = useState(false);
    const [, setLastRefresh] = useState<number | null>(null);
    const [manualRefreshStatus, setManualRefreshStatus] = useState<{
        allowed: boolean;
        lastSuccessfulAt: number | null;
        nextAllowedAt: number | null;
        remainingMs: number;
    }>({
        allowed: true,
        lastSuccessfulAt: null,
        nextAllowedAt: null,
        remainingMs: 0,
    });

    // Merge in app-level prices when they arrive
    useEffect(() => {
        if (marketPrices && Object.keys(marketPrices).length > 0) {
            setInvestPrices(prev => ({ ...prev, ...marketPrices }));
        }
    }, [marketPrices]);

    useEffect(() => {
        void getManualMarketRefreshStatus().then(setManualRefreshStatus).catch(() => {});
    }, []);

    // Fetch fresh prices on mount or when symbols change
    useEffect(() => {
        if (allHoldingSymbols.length > 0) {
            fetchMarketPrices(allHoldingSymbols).then((p: MarketPriceMap | null | undefined) => {
                if (p && Object.keys(p).length > 0) {
                    setInvestPrices(prev => ({ ...prev, ...p }));
                    if (setMarketPrices) setMarketPrices(prev => ({ ...prev, ...p }));
                    setLastRefresh(Date.now());
                }
            });
        }
    }, [allHoldingSymbols.join()]);

    // Manual refresh handler
    const handleRefreshPrices = useCallback(async () => {
        if (refreshingPrices || allHoldingSymbols.length === 0) return;
        const status = await getManualMarketRefreshStatus();
        setManualRefreshStatus(status);
        if (!status.allowed) return;
        setRefreshingPrices(true);
        try {
            const p = await fetchMarketPrices(allHoldingSymbols, true, { reason: "manual" }) as MarketPriceMap | null | undefined;
            if (p && Object.keys(p).length > 0) {
                setInvestPrices(prev => ({ ...prev, ...p }));
                if (setMarketPrices) setMarketPrices(prev => ({ ...prev, ...p }));
                setLastRefresh(Date.now());
                const nextStatus = await getManualMarketRefreshStatus();
                setManualRefreshStatus(nextStatus);
            }
        } catch {
            /* network error, silently fail */
        }
        setRefreshingPrices(false);
    }, [refreshingPrices, allHoldingSymbols, setMarketPrices]);

    const manualRefreshCooldownLabel = useMemo(() => {
        if (manualRefreshStatus.allowed || !manualRefreshStatus.remainingMs) return "Refresh prices";
        const totalMinutes = Math.max(1, Math.ceil(manualRefreshStatus.remainingMs / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0 && minutes > 0) return `Next manual refresh in ${hours}h ${minutes}m`;
        if (hours > 0) return `Next manual refresh in ${hours}h`;
        return `Next manual refresh in ${minutes}m`;
    }, [manualRefreshStatus.allowed, manualRefreshStatus.remainingMs]);

    const investTotalValue = useMemo(() => {
        let total = 0;
        (Object.values(holdings).flat().filter(Boolean) as InvestmentHolding[]).forEach((h) => {
                const p = investPrices[h?.symbol];
                if (p?.price) total += p.price * (Number(h.shares) || 0);
        });
        (financialConfig?.plaidInvestments || []).forEach((pi: PlaidInvestmentAccount) => {
            if (pi._plaidBalance) total += pi._plaidBalance;
        });
        return total;
    }, [holdings, investPrices, financialConfig?.plaidInvestments]);

    if (enabledInvestments.length === 0) return null;

    return (
        <Card
            animate
            variant="glass"
            style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}
        >
            <div
                onClick={() => setCollapsedSections(p => ({ ...p, investments: !p.investments }))}
                className="hover-card"
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    cursor: "pointer",
                    background: `linear-gradient(90deg, ${T.accent.emerald}08, transparent)`,
                    borderBottom: collapsedSections.investments ? "none" : `1px solid ${T.border.subtle}`,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: `${T.accent.emerald}1A`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: `0 0 12px ${T.accent.emerald}10`,
                        }}
                    >
                        <TrendingUp size={14} color={T.accent.emerald} />
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                        Investments
                    </h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            void handleRefreshPrices();
                        }}
                        disabled={refreshingPrices || !manualRefreshStatus.allowed}
                        title={refreshingPrices ? "Refreshing prices..." : manualRefreshCooldownLabel}
                        className="hover-btn"
                        style={{
                            background: "transparent",
                            border: "none",
                            color: refreshingPrices || !manualRefreshStatus.allowed ? T.text.muted : T.accent.emerald,
                            cursor: refreshingPrices || !manualRefreshStatus.allowed ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 4,
                            opacity: refreshingPrices || !manualRefreshStatus.allowed ? 0.45 : 0.8,
                            transition: "opacity 0.2s",
                        }}
                    >
                        <RefreshCw size={13} strokeWidth={2.5} className={refreshingPrices ? "spin" : ""} />
                    </button>
                    {investTotalValue > 0 && (
                        <Badge
                            variant="outline"
                            style={{ fontSize: 10, color: T.accent.emerald, borderColor: `${T.accent.emerald}40` }}
                        >
                            {fmt(Math.round(investTotalValue))}
                        </Badge>
                    )}
                    <ChevronDown
                        size={16}
                        color={T.text.muted}
                        className="chevron-animated"
                        data-open={String(!collapsedSections.investments)}
                    />
                </div>
            </div>

            {!collapsedSections.investments && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {enabledInvestments.map(({ key, label, color }, iGroup) => {
                        const items = holdings[key] || [];
                        const plaidItems = (financialConfig?.plaidInvestments || []).filter((pi: PlaidInvestmentAccount) => pi.bucket === key);

                        const manualValue = items.reduce((s, h) => s + (investPrices[h.symbol]?.price || 0) * (Number(h.shares) || 0), 0);
                        const plaidValue = plaidItems.reduce((s, pi) => s + (pi._plaidBalance || 0), 0);
                        const sectionValue = manualValue + plaidValue;

                        const percentOfTotal = investTotalValue > 0 ? (sectionValue / investTotalValue) * 100 : 0;
                        const totalCount = items.length + plaidItems.length;
                        const isCollapsed = collapsedInvest[key];
                        return (
                            <div
                                key={key}
                                style={{
                                    padding: 0,
                                    borderBottom: iGroup === enabledInvestments.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                                }}
                            >
                                <div
                                    onClick={() => setCollapsedInvest(p => ({ ...p, [key]: !isCollapsed }))}
                                    className="hover-card"
                                    style={{
                                        padding: "16px 18px",
                                        display: "flex",
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        cursor: "pointer",
                                        background: `${color}08`,
                                        borderBottom: isCollapsed ? "none" : `1px solid ${T.border.subtle}`,
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 800,
                                                color,
                                                textTransform: "uppercase",
                                                letterSpacing: "0.04em",
                                            }}
                                        >
                                            {label}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            style={{ fontSize: 8, color, borderColor: `${color}40`, padding: "1px 5px" }}
                                        >
                                            {totalCount}
                                        </Badge>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        {sectionValue > 0 && (
                                            <Mono size={12} weight={800} color={color}>
                                                {fmt(sectionValue)}
                                            </Mono>
                                        )}
                                        {isCollapsed ? (
                                            <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open="false" />
                                        ) : (
                                            <ChevronDown size={14} color={T.text.dim} className="chevron-animated" data-open="true" />
                                        )}
                                    </div>
                                    {enabledInvestments.length > 1 && sectionValue > 0 && (
                                        <div
                                            style={{
                                                width: "100%",
                                                height: 2,
                                                background: `${T.border.default}`,
                                                borderRadius: 2,
                                                marginTop: 6,
                                                overflow: "hidden",
                                                display: "flex",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: `${percentOfTotal}%`,
                                                    background: color,
                                                    transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="collapse-section" data-collapsed={String(isCollapsed)}>
                                    <div style={{ padding: "6px 12px" }}>
                                        {totalCount === 0 ? (
                                            <p style={{ fontSize: 11, color: T.text.muted, textAlign: "center", padding: "6px 0" }}>
                                                No holdings yet.
                                            </p>
                                        ) : (
                                            <>
                                                {plaidItems.map((pi) => (
                                                    <div
                                                        key={pi.id}
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center",
                                                            padding: "6px 0",
                                                            borderBottom: `1px solid ${T.border.subtle}`,
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <div
                                                                style={{
                                                                    padding: 4,
                                                                    borderRadius: 5,
                                                                    background: `${color}15`,
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                }}
                                                            >
                                                                <TrendingUp size={10} color={color} />
                                                            </div>
                                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                                <span style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>
                                                                    {pi.name}
                                                                </span>
                                                                <span style={{ fontSize: 9, color: T.text.dim }}>{pi.institution}</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                            <Mono size={11} weight={800} color={color}>
                                                                {fmt(pi._plaidBalance)}
                                                            </Mono>
                                                            <div
                                                                style={{
                                                                    width: 5,
                                                                    height: 5,
                                                                    borderRadius: "50%",
                                                                    background: T.status.green,
                                                                    boxShadow: `0 0 4px ${T.status.green}`,
                                                                }}
                                                                title="Synced with Plaid"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                                {items
                                                    .sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""))
                                                    .map((h, i) => {
                                                        const price = investPrices[h.symbol];
                                                        return (
                                                            <div
                                                                key={`${h.symbol}-${i}`}
                                                                style={{
                                                                    borderBottom: i === items.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        justifyContent: "space-between",
                                                                        alignItems: "center",
                                                                        padding: "8px 4px",
                                                                    }}
                                                                >
                                                                    <div>
                                                                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text.primary }}>
                                                                            {h.symbol?.replace("-USD", "")}
                                                                        </span>
                                                                        <span style={{ fontSize: 9, color: T.text.dim, marginLeft: 5 }}>
                                                                            {key === "crypto" ? `${h.shares} units` : `${h.shares} sh`}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                                        <div style={{ textAlign: "right" }}>
                                                                            {price ? (
                                                                                <>
                                                                                    <Mono size={11} weight={700} color={color}>
                                                                                        {fmt(price.price * (Number(h.shares) || 0))}
                                                                                    </Mono>
                                                                            {typeof price.changePct === "number" && (
                                                                                        <span
                                                                                            style={{
                                                                                                fontSize: 8,
                                                                                                fontFamily: T.font.mono,
                                                                                                fontWeight: 700,
                                                                                                marginLeft: 3,
                                                                                                color: price.changePct >= 0 ? T.status.green : T.status.red,
                                                                                            }}
                                                                                        >
                                                                                            {price.changePct >= 0 ? "+" : ""}
                                                                                            {price.changePct.toFixed(1)}%
                                                                                        </span>
                                                                                    )}
                                                                                </>
                                                                            ) : (
                                                                                <Mono size={10} color={T.text.muted}>
                                                                                    —
                                                                                </Mono>
                                                                            )}
                                                                        </div>
                                                                        {setFinancialConfig && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    if (window.confirm(`Delete ${h.symbol}?`)) {
                                                                                        const cur = financialConfig?.holdings || {};
                                                                                        const updated = (cur[key] || []).filter((_, idx) => idx !== i);
                                                                                        setFinancialConfig({
                                                                                            ...(financialConfig as CatalystCashConfig),
                                                                                            holdings: { ...cur, [key]: updated },
                                                                                        });
                                                                                    }
                                                                                }}
                                                                                style={{
                                                                                    width: 24,
                                                                                    height: 24,
                                                                                    borderRadius: T.radius.md,
                                                                                    border: "none",
                                                                                    background: "transparent",
                                                                                    color: T.text.dim,
                                                                                    cursor: "pointer",
                                                                                    display: "flex",
                                                                                    alignItems: "center",
                                                                                    justifyContent: "center",
                                                                                }}
                                                                            >
                                                                                <Trash2 size={11} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
