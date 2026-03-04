import { Target } from "lucide-react";
import { T } from "../constants.js";
import { fmt, fmtDate } from "../utils.js";
import { Card } from "../ui.jsx";
import { Mono } from "../components.jsx";
import ErrorBoundary from "../ErrorBoundary.jsx";

/**
 * FireCard — FIRE Projection card with ErrorBoundary wrapper.
 * Props: fireProjection — result of computeFireProjection()
 */
export default function FireCard({ fireProjection }) {
    return (
        <ErrorBoundary name="FIRE Projection">
            <Card animate delay={140} style={{
                background: `linear-gradient(160deg, ${T.bg.card}, ${T.status.blue}08)`,
                borderColor: `${T.status.blue}20`
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${T.status.blue}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Target size={13} color={T.status.blue} strokeWidth={2.5} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>FIRE Projection</span>
                    </div>
                    <Mono size={10} color={T.text.dim}>REAL RETURN {fireProjection.realReturnPct?.toFixed(2) ?? "0.00"}%</Mono>
                </div>

                {fireProjection.status === "ok" ? (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                            <div style={{ padding: "8px 10px", borderRadius: T.radius.sm, background: `${T.status.green}10`, border: `1px solid ${T.status.green}20` }}>
                                <div style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>TARGET DATE</div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: T.status.green }}>{fireProjection.projectedFireDate ? fmtDate(fireProjection.projectedFireDate) : "Now"}</div>
                            </div>
                            <div style={{ padding: "8px 10px", borderRadius: T.radius.sm, background: `${T.status.blue}10`, border: `1px solid ${T.status.blue}20` }}>
                                <div style={{ fontSize: 9, color: T.text.dim, fontFamily: T.font.mono }}>YEARS TO FIRE</div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: T.status.blue }}>
                                    {Number.isFinite(fireProjection.projectedYearsToFire) ? fireProjection.projectedYearsToFire.toFixed(1) : "—"}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                            <div style={{ padding: "7px 8px", borderRadius: T.radius.sm, background: T.bg.elevated }}>
                                <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>INCOME</div>
                                <Mono size={10} weight={700} color={T.status.green}>{fmt(fireProjection.annualIncome)}</Mono>
                            </div>
                            <div style={{ padding: "7px 8px", borderRadius: T.radius.sm, background: T.bg.elevated }}>
                                <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>EXPENSES</div>
                                <Mono size={10} weight={700} color={T.status.red}>{fmt(fireProjection.annualExpenses)}</Mono>
                            </div>
                            <div style={{ padding: "7px 8px", borderRadius: T.radius.sm, background: T.bg.elevated }}>
                                <div style={{ fontSize: 8, color: T.text.dim, fontFamily: T.font.mono }}>SAVINGS RATE</div>
                                <Mono size={10} weight={700} color={(fireProjection.savingsRatePct || 0) >= 0 ? T.status.blue : T.status.red}>
                                    {fireProjection.savingsRatePct != null ? `${fireProjection.savingsRatePct.toFixed(1)}%` : "—"}
                                </Mono>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{
                        padding: "10px 12px",
                        borderRadius: T.radius.sm,
                        background: `${T.status.amber}10`,
                        border: `1px solid ${T.status.amber}25`,
                        fontSize: 11,
                        color: T.text.secondary,
                        lineHeight: 1.5
                    }}>
                        FIRE horizon is currently not solvable with the active assumptions (reason: {fireProjection.reason || "unstable-inputs"}). Increase annual savings or expected real return.
                    </div>
                )}
            </Card>
        </ErrorBoundary>
    );
}
