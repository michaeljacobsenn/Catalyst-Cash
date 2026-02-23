import React from "react";
import { T } from "./constants.js";

export const GlobalStyles = () => (
  <style>{`
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body,#root{height:100dvh;height:100vh;background:${T.bg.base};font-family:${T.font.sans};color:${T.text.primary};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;overflow:hidden;-webkit-text-size-adjust:100%}
    
    /* Form elements — polished, large touch targets */
    input,textarea,select{
      font-family:${T.font.sans};background:${T.bg.elevated};
      border:1.5px solid ${T.border.default};color:${T.text.primary};
      border-radius:${T.radius.md}px;padding:14px 16px;font-size:16px;line-height:1.2;min-height:44px;
      width:100%;outline:none;transition:border-color .25s ease,box-shadow .25s ease,background .25s ease;
      -webkit-appearance:none;-webkit-tap-highlight-color:transparent;
    }
    input:focus,textarea:focus,select:focus{
      border-color:${T.border.focus};
      box-shadow:0 0 0 3px ${T.accent.primaryDim},0 0 16px ${T.accent.primaryGlow};
      background:${T.bg.surface};
    }
    input::placeholder,textarea::placeholder{color:${T.text.muted};font-weight:400}
    input[type="number"]{font-family:${T.font.mono};font-weight:600}
    input[type="date"]{font-family:${T.font.mono}}
    textarea{resize:vertical;min-height:96px;line-height:1.5}
    input[type="number"]::-webkit-inner-spin-button,input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    input[type="number"]{-moz-appearance:textfield}
    select{cursor:pointer}

    /* Keyframe animations */
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideUpMenu{from{opacity:0;transform:translate(-50%, 16px)}to{opacity:1;transform:translate(-50%, 0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes scaleIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
    @keyframes progressFill{from{width:0%}}
    @keyframes glowPulse{0%,100%{box-shadow:0 4px 16px rgba(130,120,255,0.2)}50%{box-shadow:0 4px 24px rgba(130,120,255,0.35)}}
    @keyframes pulseShadow{0%,100%{transform:scale(1);filter:drop-shadow(0 8px 32px rgba(0,0,0,0.4))}50%{transform:scale(1.03);filter:drop-shadow(0 16px 48px rgba(130,120,255,0.4))}}
    @keyframes subtleBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
    @keyframes pulseAlert{0%,100%{box-shadow:0 0 0 0 rgba(248,81,73,0.4)}70%{box-shadow:0 0 0 10px rgba(248,81,73,0)}}
    @keyframes confettiFall{0%{transform:translateY(0) rotate(0deg) scale(1);opacity:1}100%{transform:translateY(85vh) rotate(720deg) scale(0.3);opacity:0}}
    @keyframes confettiBurst{0%{transform:translateY(0) scale(0);opacity:0}15%{opacity:1;transform:translateY(-20px) scale(1)}100%{transform:translateY(85vh) rotate(720deg) scale(0.3);opacity:0}}
    @keyframes tabSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes tabFadeIn{from{opacity:0}to{opacity:1}}

    .slide-up{animation:slideUp .35s cubic-bezier(.16,1,.3,1) both}
    .fade-in{animation:fadeIn .4s ease both}
    .scale-in{animation:scaleIn .3s cubic-bezier(.16,1,.3,1) both}
    .shimmer-bg{background:linear-gradient(90deg,${T.bg.card} 30%,${T.bg.elevated} 50%,${T.bg.card} 70%);background-size:200% 100%;animation:shimmer 1.8s ease-in-out infinite}
    .pulse-alert{animation:pulseAlert 2s infinite}
    .tab-transition{animation:tabSlideIn .28s cubic-bezier(.16,1,.3,1) both;will-change:transform,opacity}

    /* Top 0.0001% Micro-Animations */
    .hover-card {
      transition: border-color .3s ease, box-shadow .3s cubic-bezier(0.2, 0.8, 0.2, 1), transform .3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
    }
    .hover-card:hover {
      transform: translateY(-3px) scale(1.01) !important;
      box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(160,140,220,0.15) !important;
      border-color: rgba(160,140,220,0.3) !important;
      z-index: 10;
    }
    .hover-card:active {
      transform: translateY(-1px) scale(0.99) !important;
      transition: transform 0.1s ease !important;
    }
    
    .hover-btn {
      transition: transform .2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow .2s ease, filter .2s ease !important;
    }
    .hover-btn:not(:disabled):hover {
      transform: translateY(-1px) !important;
      filter: brightness(1.1);
    }
    .hover-btn:not(:disabled):active {
      transform: translateY(1px) scale(0.97) !important;
      filter: brightness(0.95);
    }
    
    /* Scroll area */
    .scroll-area{overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior:contain}
    .scroll-area::-webkit-scrollbar{display:none}

    /* Safe-area + bottom-nav aware padding for scroll bodies */
    :root{--bottom-nav-h:72px;--top-bar-h:48px}
    .safe-scroll-body{
      padding-bottom:calc(var(--bottom-nav-h,0px) + env(safe-area-inset-bottom,0px) + 16px);
    }
    .safe-pane{
      padding-top:calc(var(--top-bar-h,0px) + env(safe-area-inset-top,0px));
    }
    .safe-pane-noheader{
      padding-top:env(safe-area-inset-top,0px);
    }
    .page-body{
      padding-inline:clamp(16px,4vw,24px);
      padding-top:clamp(12px,2vh,18px);
    }

    /* Button resets */
    button{-webkit-tap-highlight-color:transparent;font-family:${T.font.sans};touch-action:manipulation;user-select:none}
    a,[role="button"]{touch-action:manipulation}

    /* Safe area helpers */
    @supports(padding:max(0px)){
      .safe-bottom{padding-bottom:max(8px,env(safe-area-inset-bottom))}
    }
    @media screen and (max-width:480px){input,textarea,select{font-size:16px!important}}
    @media (prefers-reduced-motion: reduce){
      *,*::before,*::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}
    }

    /* ── Pinch-to-zoom & double-tap-zoom prevention ── */
    html{touch-action:pan-x pan-y;-ms-touch-action:pan-x pan-y}
    *{-webkit-user-select:none;user-select:none}
    input,textarea{-webkit-user-select:text;user-select:text}

    /* ── Landscape mode: constrain to a centered 520px pillar ── */
    @media (orientation:landscape) and (max-height:600px){
      #root{
        max-width:520px;
        margin-left:auto;
        margin-right:auto;
        border-left:1px solid rgba(255,255,255,0.04);
        border-right:1px solid rgba(255,255,255,0.04);
      }
    }

    /* ── Keyboard-aware scrolling: let the environment variable shift content ── */
    @supports (padding-bottom: env(keyboard-inset-height, 0px)){
      .safe-scroll-body{
        padding-bottom:calc(var(--bottom-nav-h,72px) + env(safe-area-inset-bottom,0px) + env(keyboard-inset-height,0px) + 16px);
      }
    }
  `}</style>
);

export const Card = ({ children, style, animate, delay = 0, onClick, variant = "default" }) => {
  const variants = {
    default: {
      background: T.bg.card,
      border: `1px solid ${T.border.subtle}`,
      boxShadow: T.shadow.card,
    },
    elevated: {
      background: T.bg.elevated,
      border: `1px solid ${T.border.default}`,
      boxShadow: T.shadow.elevated,
    },
    glass: {
      background: T.bg.glass,
      border: `1px solid ${T.border.default}`,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      boxShadow: T.shadow.card,
    },
    accent: {
      background: `linear-gradient(135deg,${T.accent.primaryDim},${T.bg.card})`,
      border: `1px solid ${T.accent.primarySoft}`,
      boxShadow: `${T.shadow.card}, 0 0 12px ${T.accent.primaryDim}`,
    },
  };
  const v = variants[variant] || variants.default;

  return (
    <div
      onClick={onClick}
      className={`${animate ? "slide-up " : ""}${onClick ? "hover-card " : ""}`}
      style={{
        ...v,
        borderRadius: T.radius.lg,
        padding: "18px 16px",
        marginBottom: 10,
        transition: "border-color .25s ease, box-shadow .25s ease, transform .2s ease",
        ...(onClick ? { cursor: "pointer", position: "relative" } : {}),
        ...(animate ? { animationDelay: `${delay}ms` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Label = ({ children, style }) => (
  <label
    style={{
      display: "block",
      fontSize: 10,
      fontWeight: 700,
      color: T.text.dim,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      marginBottom: 8,
      fontFamily: T.font.mono,
      ...style,
    }}
  >
    {children}
  </label>
);

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div
          style={{
            background: T.status.redDim,
            border: `1px solid ${T.status.red}20`,
            borderRadius: T.radius.lg,
            padding: "18px 16px",
            margin: "8px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.status.red }}>Display Error</span>
          </div>
          <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5, marginBottom: 10 }}>
            {this.state.error.message || "Failed to render."}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "8px 16px",
              borderRadius: T.radius.md,
              border: "none",
              background: T.status.red,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      );
    return this.props.children;
  }
}

export const Badge = ({ variant = "gray", children, style }) => {
  const m = {
    green: { bg: T.status.greenDim, c: T.status.green },
    amber: { bg: T.status.amberDim, c: T.status.amber },
    red: { bg: T.status.redDim, c: T.status.red },
    blue: { bg: T.status.blueDim, c: T.status.blue },
    purple: { bg: T.status.purpleDim, c: T.status.purple },
    gray: { bg: "rgba(110,118,129,0.08)", c: T.text.secondary },
    teal: { bg: T.accent.primaryDim, c: T.accent.primary },
    gold: { bg: T.accent.copperDim, c: T.accent.copper },
  };
  const s = m[variant] || m.gray;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        background: s.bg,
        color: s.c,
        fontFamily: T.font.mono,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        border: `1px solid ${s.c}12`,
        ...style,
      }}
    >
      {children}
    </span>
  );
};
