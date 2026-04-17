  import { useMemo } from "react";
  import { Mono } from "../components.js";
  import { T } from "../constants.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { HelpCircle } from "../icons";
  import { computeCreditUtilizationSummary } from "./creditUtilization.js";
  import { InlineTooltip } from "../ui.js";
  import { fmt } from "../utils.js";

export default function CreditUtilizationWidget() {
    const { cards } = usePortfolio();

    const creditCards = useMemo(() => cards.filter(c => c.cardType !== "charge"), [cards]);

    const { totalCreditBalance, totalCreditLimit, creditUtilization, gaugeUtilization } = useMemo(
        () => computeCreditUtilizationSummary(creditCards),
        [creditCards]
    );

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

    const gaugeSize = 48;
    const gaugeCenter = gaugeSize / 2;
    const gaugeStrokeInset = 3;
    const stroke = 6;
    const normalizedRadius = gaugeCenter - gaugeStrokeInset - stroke * 0.5;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (gaugeUtilization / 100) * circumference;

    if (creditCards.length === 0) return null;

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{
                padding: "16px 18px",
                background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
                border: `1px solid ${T.border.subtle}`,
                borderRadius: T.radius.lg,
                boxShadow: `0 10px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.04)`,
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
                        {totalCreditLimit > 0 && (
                            <div
                                style={{
                                    marginTop: 10,
                                    height: 7,
                                    borderRadius: 999,
                                    background: T.bg.surface,
                                    overflow: "hidden",
                                    border: `1px solid ${T.border.subtle}`,
                                    maxWidth: 220,
                                }}
                            >
                                <div
                                    style={{
                                        width: `${Math.max(4, gaugeUtilization)}%`,
                                        height: "100%",
                                        background: `linear-gradient(90deg, ${utilColor}, ${T.accent.primary})`,
                                        borderRadius: 999,
                                        transition: "width .45s cubic-bezier(0.16, 1, 0.3, 1)",
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    <div style={{ position: "relative", width: gaugeSize, height: gaugeSize, marginLeft: 16, flexShrink: 0 }}>
                        <svg
                            width={gaugeSize}
                            height={gaugeSize}
                            viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}
                            style={{ display: "block", overflow: "visible" }}
                        >
                            <circle
                                stroke={T.border.default}
                                fill="transparent"
                                strokeWidth={stroke}
                                r={normalizedRadius}
                                cx={gaugeCenter}
                                cy={gaugeCenter}
                            />
                            <circle
                                stroke={utilColor}
                                fill="transparent"
                                strokeWidth={stroke}
                                strokeDasharray={circumference + " " + circumference}
                                style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s ease-in-out" }}
                                strokeLinecap="round"
                                r={normalizedRadius}
                                cx={gaugeCenter}
                                cy={gaugeCenter}
                                transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
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
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border.subtle}`, gap: 12 }}>
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
