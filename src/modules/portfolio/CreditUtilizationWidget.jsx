import { useMemo } from "react";
import { HelpCircle } from "lucide-react";
import { Card, Badge, InlineTooltip } from "../ui.jsx";
import { Mono } from "../components.jsx";
import { T } from "../constants.js";
import { usePortfolio } from "../contexts/PortfolioContext.jsx";
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
        <Card animate style={{ marginTop: 16 }}>
            <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <h3
                            style={{
                                fontSize: 14,
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
                        <p style={{ fontSize: 13, color: T.text.dim, marginTop: 4, fontWeight: 500 }}>
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
                    <div style={{ position: "relative", width: 48, height: 48 }}>
                        <svg height="48" width="48">
                            <circle
                                stroke={T.border.default}
                                fill="transparent"
                                strokeWidth={stroke}
                                r={normalizedRadius}
                                cx={24}
                                cy={24}
                            />
                            <circle
                                stroke={utilColor}
                                fill="transparent"
                                strokeWidth={stroke}
                                strokeDasharray={circumference + " " + circumference}
                                style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s ease-in-out" }}
                                strokeLinecap="round"
                                r={normalizedRadius}
                                cx={24}
                                cy={24}
                                transform="rotate(-90 24 24)"
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
                                fontSize: 12,
                                fontWeight: 800,
                                color: T.text.primary,
                            }}
                        >
                            {Math.round(creditUtilization)}%
                        </div>
                    </div>
                </div>
                {totalCreditLimit > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                        <div>
                            <p style={{ fontSize: 11, color: T.text.dim, fontWeight: 600, textTransform: "uppercase" }}>
                                Total Balances
                            </p>
                            <Mono size={15} weight={800} color={T.text.primary}>
                                {totalCreditBalance > 0 ? fmt(totalCreditBalance) : "$0"}
                            </Mono>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <p style={{ fontSize: 11, color: T.text.dim, fontWeight: 600, textTransform: "uppercase" }}>
                                Total Credit
                            </p>
                            <Mono size={15} weight={800} color={T.text.primary}>
                                {fmt(totalCreditLimit)}
                            </Mono>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}
