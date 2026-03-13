import { useMemo } from "react";
import { HelpCircle } from "lucide-react";
import { Card, Badge, InlineTooltip } from "../ui.js";
import { Mono } from "../components.js";
import { T } from "../constants.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { fmt } from "../utils.js";

export default function CreditUtilizationWidget() {
    const { cards } = usePortfolio();

    const creditCards = useMemo(() => cards.filter(c => c.cardType !== "charge"), [cards]);

    const { totalCreditBalance, totalCreditLimit } = useMemo(() => {
        let bal = 0;
        let lim = 0;
        creditCards.forEach(c => {
            bal += c._plaidBalance != null ? c._plaidBalance : c.balance || 0;
            lim += c._plaidLimit != null ? c._plaidLimit : c.limit || 0;
        });
        return { totalCreditBalance: bal, totalCreditLimit: lim };
    }, [creditCards]);

    const creditUtilization = totalCreditLimit > 0 ? (totalCreditBalance / totalCreditLimit) * 100 : 0;

    let utilColor = T.accent.emerald;
    let utilLabel = "Excellent";
    if (creditUtilization >= 30) {
        utilColor = T.status.green;
        utilLabel = "Good";
    }
    if (creditUtilization >= 50) {
        utilColor = T.status.amber;
        utilLabel = "Fair";
    }
    if (creditUtilization >= 75) {
        utilColor = T.status.red;
        utilLabel = "High";
    }
    if (totalCreditLimit === 0) utilLabel = "N/A";

    const radius = 24;
    const stroke = 6;
    const normalizedRadius = radius - stroke * 0.5;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (creditUtilization / 100) * circumference;

    if (creditCards.length === 0) return null;

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{
                padding: "16px 20px",
                background: T.bg.card,
                border: `1px solid ${T.border.subtle}`,
                borderRadius: T.radius.md,
                boxShadow: `0 2px 8px rgba(0,0,0,0.12)`,
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                        <h3
                            style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: T.text.primary,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}
                        >
                            Credit Utilization
                            <InlineTooltip term="Shows your total statement balances against total credit limits. Excludes charge cards.">
                                <HelpCircle size={14} color={T.text.dim} />
                            </InlineTooltip>
                        </h3>
                        <p style={{ fontSize: 12, color: T.text.dim, marginTop: 4, fontWeight: 500 }}>
                            {totalCreditLimit === 0 ? (
                                "No credit limits set"
                            ) : (
                                <>
                                    <span style={{ color: utilColor, fontWeight: 700 }}>{utilLabel}</span> — using{" "}
                                    {creditUtilization.toFixed(1)}% of limit
                                </>
                            )}
                        </p>
                    </div>
                    <div style={{ position: "relative", width: 44, height: 44, marginLeft: 16 }}>
                        <svg height="44" width="44">
                            <circle
                                stroke={T.border.default}
                                fill="transparent"
                                strokeWidth={stroke}
                                r={normalizedRadius}
                                cx={22}
                                cy={22}
                            />
                            <circle
                                stroke={utilColor}
                                fill="transparent"
                                strokeWidth={stroke}
                                strokeDasharray={circumference + " " + circumference}
                                style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s ease-in-out" }}
                                strokeLinecap="round"
                                r={normalizedRadius}
                                cx={22}
                                cy={22}
                                transform="rotate(-90 22 22)"
                            />
                        </svg>
                        <div
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 800,
                                color: T.text.primary,
                            }}
                        >
                            {Math.round(creditUtilization)}%
                        </div>
                    </div>
                </div>
                {totalCreditLimit > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border.subtle}` }}>
                        <div>
                            <p style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Total Balances
                            </p>
                            <Mono size={15} weight={800} color={T.text.primary} style={{ marginTop: 4 }}>
                                {totalCreditBalance > 0 ? fmt(totalCreditBalance) : "$0"}
                            </Mono>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <p style={{ fontSize: 10, color: T.text.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Total Credit
                            </p>
                            <Mono size={15} weight={800} color={T.text.primary} style={{ marginTop: 4 }}>
                                {fmt(totalCreditLimit)}
                            </Mono>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
