import { T } from "../constants.js";
import { buildPromoLine, PRO_BANNER_BENEFITS } from "../planCatalog.js";
import { haptic } from "../haptics.js";
import UiGlyph from "../UiGlyph.js";

interface ProBannerProps {
  onUpgrade?: () => void;
  label?: string;
  sublabel?: string;
  compact?: boolean;
}

function UpgradeArrow() {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 900,
        color: T.accent.primary,
        fontFamily: T.font.mono,
        letterSpacing: "0.05em",
      }}
    >
      PRO →
    </span>
  );
}

export default function ProBanner({ onUpgrade, label, sublabel, compact = false }: ProBannerProps) {
  const handleClick = () => {
    haptic.medium();
    onUpgrade?.();
  };

  if (compact) {
    return (
      <button type="button"
        role="banner"
        aria-label="Upgrade to Pro"
        data-no-swipe="true"
        onClick={handleClick}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 18,
          border: `1px solid ${T.border.default}`,
          background: `linear-gradient(135deg, ${T.bg.card}, ${T.bg.elevated})`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          boxShadow: `0 10px 26px rgba(0,0,0,0.16)`,
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: T.accent.primary,
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
              {label || "Unlock Catalyst Cash Pro"}
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45 }}>
            {sublabel || buildPromoLine(["audits", "chats", "ledger"])}
          </div>
        </div>
        <UpgradeArrow />
      </button>
    );
  }

  const visibleBenefits = PRO_BANNER_BENEFITS.slice(0, 3);

  return (
    <button type="button"
      role="banner"
      aria-label="Upgrade to Catalyst Cash Pro"
      data-no-swipe="true"
      onClick={handleClick}
      style={{
        width: "100%",
        padding: "18px 18px 16px",
        borderRadius: 24,
        border: `1px solid ${T.border.default}`,
        background: `linear-gradient(155deg, ${T.bg.card}, ${T.bg.elevated} 62%, ${T.bg.surface})`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        marginBottom: 8,
        textAlign: "left",
        boxShadow: `0 20px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at top right, ${T.accent.primary}14, transparent 42%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, position: "relative", zIndex: 1 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: T.accent.primary, letterSpacing: "0.10em", fontFamily: T.font.mono, marginBottom: 6 }}>
            PRO PLAN
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, color: T.text.primary, letterSpacing: "-0.03em", marginBottom: 5 }}>
            {label || "Unlock Catalyst Cash Pro"}
          </div>
          <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.55, maxWidth: 420 }}>
            {sublabel || buildPromoLine(["audits", "chats", "plaid"])}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: `1px solid ${T.accent.primary}20`,
            background: `${T.accent.primary}10`,
            color: T.accent.primary,
            fontSize: 10,
            fontWeight: 900,
            fontFamily: T.font.mono,
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}
        >
          UPGRADE
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, position: "relative", zIndex: 1 }}>
        {visibleBenefits.map((benefit) => (
          <div
            key={benefit.text}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 999,
              background: `${T.bg.elevated}D9`,
              border: `1px solid ${T.border.subtle}`,
              fontSize: 11,
              fontWeight: 700,
              color: T.text.secondary,
            }}
          >
            <UiGlyph glyph={benefit.emoji} size={12} color={T.accent.primary} />
            {benefit.text}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 11, color: T.text.dim, lineHeight: 1.45 }}>
          Pay once through Apple. Upgrade only when the extra depth will actually save you time or money.
        </div>
        <UpgradeArrow />
      </div>
    </button>
  );
}
