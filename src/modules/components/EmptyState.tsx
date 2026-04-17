import type { CSSProperties, FC, ReactNode } from "react";

import { T } from "../constants.js";

interface EmptyStateProps {
  icon: FC<{ size?: number; color?: string; strokeWidth?: number; style?: CSSProperties }>;
  title: string;
  message: string;
  action?: ReactNode;
  delay?: number;
}

export default function EmptyState({ icon: Icon, title, message, action, delay = 0 }: EmptyStateProps) {
  return (
    <div
      className="scale-in"
      style={{
        textAlign: "center",
        padding: "56px 24px 48px",
        animationDelay: `${delay}ms`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          left: "20%",
          width: 120,
          height: 120,
          background: T.accent.primary,
          filter: "blur(80px)",
          opacity: 0.08,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -30,
          right: "15%",
          width: 100,
          height: 100,
          background: T.accent.emerald,
          filter: "blur(70px)",
          opacity: 0.06,
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", width: 96, height: 96, marginBottom: 28 }}>
        <div
          style={{
            position: "absolute",
            inset: -16,
            borderRadius: "50%",
            border: `1px dashed ${T.border.focus}`,
            opacity: 0.2,
            animation: "spin 25s linear infinite",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -3,
              left: "50%",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: T.accent.primary,
              opacity: 0.6,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: `1px dashed ${T.accent.emeraldSoft}`,
            opacity: 0.25,
            animation: "spin 15s linear infinite reverse",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: -2,
              right: "10%",
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: T.accent.emerald,
              opacity: 0.5,
            }}
          />
        </div>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: `linear-gradient(145deg, ${T.accent.primaryDim}, ${T.bg.card})`,
            border: `1px solid ${T.accent.primarySoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 48px ${T.accent.primaryDim}, 0 8px 32px rgba(0,0,0,0.15), inset 0 2px 10px rgba(255,255,255,0.05)`,
          }}
        >
          <Icon
            size={36}
            color={T.accent.primary}
            strokeWidth={1.5}
            style={{ filter: `drop-shadow(0 2px 10px ${T.accent.primaryGlow})` }}
          />
        </div>
      </div>

      <h3
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: T.text.primary,
          marginBottom: 10,
          letterSpacing: "-0.02em",
          animation: "fadeInUp .5s ease-out .15s both",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: T.text.secondary,
          lineHeight: 1.7,
          maxWidth: 300,
          margin: "0 auto",
          animation: "fadeInUp .5s ease-out .25s both",
        }}
      >
        {message}
      </p>
      {action && <div style={{ marginTop: 20, animation: "fadeInUp .5s ease-out .35s both" }}>{action}</div>}
    </div>
  );
}
