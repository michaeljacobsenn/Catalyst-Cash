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
  const healthGaugeHint =
    "The circular gauge summarizes current financial health. A higher score indicates better overall financial stability.";

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
    const tick = now => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
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
      style={{ position: "relative", width: 110, height: 100, flexShrink: 0, isolation: "isolate" }}
    >
      <svg
        width="110"
        height="100"
        viewBox="0 0 110 100"
        style={{ position: "relative", zIndex: 1, transform: "translateZ(0)" }}
      >
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={`${T.border.default} `}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25} `}
          transform="rotate(135,55,55)"
        />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          transform="rotate(135,55,55)"
          style={{ transition: "stroke-dasharray 1.2s ease-out, stroke 0.8s ease" }}
        />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.12"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          transform="rotate(135,55,55)"
          style={{ animation: "gaugePulseRing 3s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      <div
        className="score-pop"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 8,
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 900, color: scoreColor, fontFamily: T.font.sans, lineHeight: 1 }}>
          {grade}
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, fontFamily: T.font.mono, marginTop: 2 }}>
          {displayScore}/100
        </div>
        {percentile > 0 && (
          <div
            style={{
              fontSize: 8,
              fontWeight: 800,
              color: scoreColor,
              fontFamily: T.font.mono,
              background: `${scoreColor}15`,
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              padding: "2px 8px",
              borderRadius: 12,
              border: `1px solid ${scoreColor}20`,
              letterSpacing: "0.04em",
              marginTop: 6,
            }}
          >
            Top {100 - percentile}%
          </div>
        )}
      </div>
      <span id="health-score-gauge-hint" className="sr-only">
        {healthGaugeHint}
      </span>
    </div>
  );
}
