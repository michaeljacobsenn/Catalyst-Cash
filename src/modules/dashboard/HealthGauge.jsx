import { useState, useEffect, useRef } from "react";
import { T } from "../constants.js";

/**
 * HealthGauge — SVG arc gauge showing financial health score, grade, and percentile.
 * Features animated count-up when score changes.
 */
export default function HealthGauge({ score, grade, scoreColor, percentile }) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const arcLength = (score / 100) * circumference * 0.75;
    const healthGaugeLabel = `Health score gauge showing ${score} out of 100, grade ${grade}.`;
    const healthGaugeHint = "The circular gauge summarizes current financial health. A higher score indicates better overall financial stability.";

    // Animated count-up
    const [displayScore, setDisplayScore] = useState(0);
    const prevScoreRef = useRef(0);
    useEffect(() => {
        const from = prevScoreRef.current;
        const to = score;
        if (from === to) return;
        prevScoreRef.current = to;
        const duration = 800;
        const start = performance.now();
        let raf;
        const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayScore(Math.round(from + (to - from) * eased));
            if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [score]);

    return (
        <div
            role="img"
            aria-label={healthGaugeLabel}
            aria-describedby="health-score-gauge-hint"
            style={{ position: "relative", width: 90, height: 80, flexShrink: 0 }}
        >
            <svg width="90" height="80" viewBox="0 0 90 80">
                <circle cx="45" cy="45" r={radius} fill="none" stroke={`${T.border.default} `}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25} `}
                    transform="rotate(135,45,45)" />
                <circle cx="45" cy="45" r={radius} fill="none" stroke={scoreColor}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    transform="rotate(135,45,45)"
                    style={{ transition: "stroke-dasharray 1.2s ease-out, stroke 0.8s ease" }} />
                <circle cx="45" cy="45" r={radius} fill="none" stroke={scoreColor}
                    strokeWidth="10" strokeLinecap="round" opacity="0.12"
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    transform="rotate(135,45,45)"
                    style={{ animation: "pulseRing 3s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)" }} />
            </svg>
            <div style={{ position: "absolute", top: "46%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: scoreColor, fontFamily: T.font.sans, lineHeight: 1 }}>{grade}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.text.dim, fontFamily: T.font.mono, marginTop: 1 }}>{displayScore}/100</div>
            </div>
            {percentile > 0 && <div style={{
                position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
                fontSize: 7, fontWeight: 800, color: scoreColor, fontFamily: T.font.mono,
                background: `${scoreColor}12`, padding: "2px 7px", borderRadius: 10,
                border: `1px solid ${scoreColor}20`, letterSpacing: "0.02em"
            }}>Top {100 - percentile}%</div>}
            <span id="health-score-gauge-hint" className="sr-only">{healthGaugeHint}</span>
        </div>
    );
}

