  import type { CSSProperties,KeyboardEvent as ReactKeyboardEvent,MouseEvent as ReactMouseEvent,ReactNode } from "react";
  import React,{ useEffect } from "react";
  import { T } from "./constants.js";
  import { haptic } from "./haptics.js";

type FontWeight = "regular" | "bold" | number;
type CardVariant = "default" | "elevated" | "glass" | "accent";
type BadgeVariant = "green" | "amber" | "red" | "blue" | "purple" | "gray" | "teal" | "gold" | "outline" | "success";
type NoticeTone = "info" | "success" | "warning" | "error";

interface CardProps {
  children?: ReactNode;
  style?: CSSProperties;
  animate?: boolean;
  delay?: number;
  onClick?: (event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>) => void;
  variant?: CardVariant;
  className?: string;
}

interface LabelProps {
  children?: ReactNode;
  style?: CSSProperties;
}

interface BadgeProps {
  variant?: BadgeVariant;
  children?: ReactNode;
  style?: CSSProperties;
  size?: "sm" | "md" | "lg";
}

interface FormGroupProps {
  children?: ReactNode;
  label?: ReactNode;
  style?: CSSProperties;
}

interface FormRowProps {
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label?: ReactNode;
  children?: ReactNode;
  isLast?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: CSSProperties;
  isCircle?: boolean;
}

interface InlineTooltipProps {
  term?: string;
  children?: ReactNode;
}

interface NoticeBannerProps {
  tone?: NoticeTone;
  title?: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  style?: CSSProperties;
}

interface ListSectionProps {
  children?: ReactNode;
  style?: CSSProperties;
}

interface ListRowProps {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  isLast?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL HAPTICS — Auto-fire haptic.light() on every button tap
// Single delegated listener, zero per-component wiring needed
// ═══════════════════════════════════════════════════════════════
export function useGlobalHaptics() {
  useEffect(() => {
    let lastTouchHapticAt = 0;
    const handler = (e: TouchEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLElement>("button, [role='button']");
      if (!btn || ("disabled" in btn && btn.disabled)) return;
      if (btn.getAttribute("role") === "tab" || btn.closest("[role='tablist']")) return;
      const now = Date.now();
      if (now - lastTouchHapticAt < 180) return;
      lastTouchHapticAt = now;
      haptic.light();
    };
    document.addEventListener("touchstart", handler, { passive: true });
    return () => document.removeEventListener("touchstart", handler);
  }, []);
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC TYPOGRAPHY TRACKING
// Replicates Apple's San Francisco dynamic letter-spacing curves.
// Larger text = tighter tracking. Smaller text = looser tracking.
// ═══════════════════════════════════════════════════════════════
export const getTracking = (fontSize: number, weight: FontWeight = "regular") => {
  // Base mathematical curve for SF Pro
  let tracking =
    fontSize <= 10 ? 0.04
    : fontSize <= 12 ? 0.02
    : fontSize <= 16 ? 0
    : fontSize <= 24 ? -0.015
    : fontSize <= 36 ? -0.025
    : -0.04; // Massive numbers

  // Adjust for visual weight (heavy weights need slightly more breathing room)
  if (weight === "bold" || (typeof weight === "number" && weight >= 700)) {
    tracking += 0.005;
  }
  return `${tracking}em`;
};

export const GlobalStyles = () => (
  <style>{`
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body,#root{height:100dvh;height:100vh;background:var(--cc-bg-base, ${T.bg.base});font-family:${T.font.sans};color:${T.text.primary};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;overflow:hidden;-webkit-text-size-adjust:100%}
    
    /* iOS 18 Typography & Form elements — minimum 44pt touch targets */
    input,textarea,select{
      font-family:${T.font.sans};background:linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card});
      border:1.5px solid ${T.border.default};color:${T.text.primary};
      border-radius:${T.radius.md}px;padding:14px 16px;font-size:16px;line-height:1.2;
      min-height:44px; /* HIG 44pt Touch Target */
      width:100%;outline:none;transition:border-color .25s ease,box-shadow .25s ease,background .25s ease,transform .25s ease;
      -webkit-appearance:none;-webkit-tap-highlight-color:transparent;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 18px rgba(0,0,0,0.10);
    }
    input:focus,textarea:focus,select:focus{
      border-color:${T.border.focus};
      box-shadow:0 0 0 3px ${T.accent.primaryDim},0 0 18px ${T.accent.primaryGlow}, 0 10px 24px rgba(0,0,0,0.12);
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
    @keyframes scorePop{0%{opacity:0;transform:scale(0.85)}60%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
    @keyframes confettiFall{0%{transform:translateY(0) rotate(0deg) scale(1);opacity:1}100%{transform:translateY(85vh) rotate(720deg) scale(0.3);opacity:0}}
    @keyframes confettiBurst{0%{transform:translateY(0) scale(0);opacity:0}15%{opacity:1;transform:translateY(-20px) scale(1)}100%{transform:translateY(85vh) rotate(720deg) scale(0.3);opacity:0}}
    @keyframes floatUp{0%{transform:translateY(0);opacity:0.8}50%{transform:translateY(-10px);opacity:1}100%{transform:translateY(0);opacity:0.6}}
    @keyframes ctaShimmer{0%{background-position:-200% center}100%{background-position:200% center}}
    @keyframes ambientFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(8px,-6px) scale(1.05)}66%{transform:translate(-4px,4px) scale(0.97)}}
    @keyframes tabSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes tabFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes shellBreathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
    @keyframes settingsSlideIn{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
    @keyframes settingsSlideOut{from{opacity:0;transform:translateX(-50px)}to{opacity:1;transform:translateX(0)}}
    @keyframes slidePaneIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes paneSlideFromRight{from{transform:translateX(100%);opacity:0.8}to{transform:translateX(0);opacity:1}}
    @keyframes paneSlideToRight{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0.6}}
    @keyframes modalSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes modalSlideDown{from{transform:translateY(0)}to{transform:translateY(100%);opacity:0}}

    /* ── Native iOS-style horizontal swipe transitions ── */
    /* REMOVED: tabSlideFromRight and tabSlideFromLeft are replaced by native scroll-snap */

    /* Native Apple Spring Physics (UISpringTimingParameters equivalent) */
    :root {
      --spring-soft: cubic-bezier(0.175, 0.885, 0.32, 1.15);
      --spring-stiff: cubic-bezier(0.25, 1, 0.5, 1);
      --spring-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .slide-up{animation:slideUp .5s var(--spring-elastic) both;will-change:transform,opacity;transform:translateZ(0);}
    .fade-in{animation:fadeIn .4s var(--spring-stiff) both;transform:translateZ(0);}
    .scale-in{animation:scaleIn .4s var(--spring-elastic) both;transform:translateZ(0);}
    .score-pop{animation:scorePop .6s var(--spring-elastic) .4s both;will-change:transform,opacity;transform:translateZ(0);}
    .shimmer-bg{background:linear-gradient(90deg,${T.bg.card} 30%,${T.bg.elevated} 50%,${T.bg.card} 70%);background-size:200% 100%;animation:shimmer 2.5s ease-in-out 1 forwards;transform:translateZ(0);}
    .pulse-alert{animation:pulseAlert 2.5s infinite var(--spring-soft);transform:translateZ(0);}
    .spin{animation:spin .8s linear infinite;transform:translateZ(0);}
    .tab-transition{animation:tabSlideIn .35s var(--spring-elastic) both;will-change:transform,opacity;transform:translateZ(0);}
    /* REMOVED: .tab-slide-right and .tab-slide-left replaced by native scroll-snap */
    .slide-pane{animation:paneSlideFromRight .4s var(--spring-elastic) both;will-change:transform,opacity;transform:translateZ(0);}
    .slide-pane-dismiss{animation:paneSlideToRight .35s cubic-bezier(.4,0,1,1) both;will-change:transform,opacity;transform:translateZ(0);}
    .modal-pane{animation:modalSlideUp .45s var(--spring-elastic) both;will-change:transform;background:var(--bg-base);z-index:200;transform:translateZ(0);}
    .modal-pane-dismiss{animation:modalSlideDown .35s cubic-bezier(.4,0,1,1) both;will-change:transform,opacity;z-index:200;transform:translateZ(0);}
    
    /* ── Staggered Waterfall Transitions ── */
    /* Add this class to a parent to cascade its children's entrance */
    .stagger-container > * { opacity: 0; animation: slideUp 0.6s var(--spring-elastic) forwards; }
    .stagger-container > *:nth-child(1) { animation-delay: 0.05s; }
    .stagger-container > *:nth-child(2) { animation-delay: 0.10s; }
    .stagger-container > *:nth-child(3) { animation-delay: 0.15s; }
    .stagger-container > *:nth-child(4) { animation-delay: 0.20s; }
    .stagger-container > *:nth-child(5) { animation-delay: 0.25s; }
    .stagger-container > *:nth-child(6) { animation-delay: 0.30s; }
    .stagger-container > *:nth-child(7) { animation-delay: 0.35s; }
    .stagger-container > *:nth-child(8) { animation-delay: 0.40s; }
    .stagger-container > *:nth-child(n+9) { animation-delay: 0.45s; }
    /* Interactive swipe-back/down: disable CSS animation while user is dragging */
    .swipe-back-pane, .swipe-down-pane{will-change:transform;transition:none !important;animation:none !important;transform:translateZ(0);}
    html[data-gesture-nav="active"] .swipe-back-pane,
    html[data-gesture-nav="active"] .swipe-down-pane{
      backface-visibility:hidden;
      transform:translateZ(0);
    }
    html[data-gesture-nav="active"] .swipe-back-pane *,
    html[data-gesture-nav="active"] .swipe-down-pane *{
      transition:none !important;
      animation-play-state:paused !important;
      caret-color:transparent;
    }
    html[data-gesture-nav="active"] .gesture-glass,
    html[data-gesture-nav="active"] .gesture-glass-soft{
      backdrop-filter:none !important;
      -webkit-backdrop-filter:none !important;
    }
    html[data-gesture-nav="active"] .gesture-shadow-heavy{
      box-shadow:none !important;
      filter:none !important;
    }
    html[data-gesture-nav="active"] .gesture-shadow-soft{
      box-shadow:none !important;
    }
    html[data-gesture-nav="active"] .gesture-blur{
      filter:none !important;
    }
    html[data-gesture-nav="active"] [style*="backdrop-filter"]{
      backdrop-filter:none !important;
      -webkit-backdrop-filter:none !important;
    }
    html[data-gesture-nav="active"] [style*="box-shadow"]{
      box-shadow:none !important;
    }
    html[data-gesture-nav="active"] [style*="filter: blur"]{
      filter:none !important;
    }

    /* Top 0.00001% Micro-Animations & Haptic Press States */
    .hover-card {
      transition: border-color .4s ease, box-shadow .4s var(--spring-elastic), transform .4s var(--spring-elastic) !important;
      will-change: transform, box-shadow;
    }
    .hover-card:hover {
      transform: translateY(-3px) scale(1.008) translateZ(0) !important;
      box-shadow: 0 18px 38px rgba(0,0,0,0.34), 0 8px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(160,140,220,0.16) !important;
      border-color: rgba(160,140,220,0.26) !important;
      z-index: 10;
    }
    .hover-card:active {
      transform: translateY(2px) scale(0.97) translateZ(0) !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.7), 0 0 0 1px rgba(160,140,220,0.05) !important;
      transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease !important;
    }
    
    .hover-btn {
      transition: transform .3s var(--spring-elastic), box-shadow .3s ease, filter .3s ease, opacity .3s ease !important;
      will-change: transform, filter;
    }
    .hover-btn:not(:disabled):hover {
      filter: brightness(1.1);
      transform: translateY(-1px) scale(1.02) translateZ(0) !important;
    }
    .hover-btn:not(:disabled):active {
      transform: translateY(2px) scale(0.94) translateZ(0) !important;
      filter: brightness(0.9);
      opacity: 0.85;
      transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), filter 0.1s ease, opacity 0.1s ease !important;
    }

    /* Smooth section collapse/expand */
    .collapse-section{
      overflow:hidden;
      transition:max-height .35s cubic-bezier(0.16, 1, 0.3, 1), opacity .25s ease;
    }
    .collapse-section[data-collapsed="true"]{
      max-height:0 !important;
      opacity:0;
      pointer-events:none;
    }
    .collapse-section[data-collapsed="false"]{
      max-height:5000px;
      opacity:1;
    }

    /* Animated chevron for expand/collapse */
    .chevron-animated{
      transition:transform .3s var(--spring-stiff);
    }
    .chevron-animated[data-open="true"]{
      transform:rotate(180deg);
    }
    
    /* Scroll area */
    .scroll-area{overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior:contain}
    .scroll-area::-webkit-scrollbar{display:none}

    /* ── Gesture-driven horizontal tab track ── */
    .snap-container {
      position: relative;
      display:flex;
      flex-direction:column;
      min-height:0;
      overflow: hidden;
      overscroll-behavior-x: none;
    }
    .snap-container::-webkit-scrollbar {
      display: none;
    }
    .snap-track {
      display: flex;
      flex-direction: row;
      height: 100%;
      min-height: 0;
      will-change: transform;
    }
    .snap-page {
      flex: 0 0 var(--snap-pane-w, 100%);
      width: var(--snap-pane-w, 100%);
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      position: relative;
    }

    /* Safe-area aware padding for scroll bodies */
    :root{--top-bar-h:48px;--page-bottom-padding:clamp(16px,2vh,24px)}
    .safe-scroll-body{
      padding-bottom:max(var(--page-bottom-clearance, var(--page-bottom-padding)), env(safe-area-inset-bottom, 0px));
    }
    .safe-pane{
      padding-top:calc(var(--top-bar-h,0px) + env(safe-area-inset-top,0px));
    }
    .safe-pane-noheader{
      padding-top:env(safe-area-inset-top,0px);
    }
    .page-body{
      padding-inline:clamp(14px,3.6vw,24px);
      padding-top:clamp(10px,1.8vh,16px);
      padding-bottom:var(--page-bottom-clearance, var(--page-bottom-padding));
    }

    /* Button resets & Accessibility 44pt min target */
    button{
      -webkit-tap-highlight-color:transparent;font-family:${T.font.sans};touch-action:manipulation;
      user-select:none;
      min-height: 44px; /* Strict HIG Compliance */
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    a,[role="button"],.hover-card {
      touch-action:manipulation;
    }

    /* Safe area helpers */
    @supports(padding:max(0px)){
      .safe-bottom{padding-bottom:max(var(--page-bottom-clearance, var(--page-bottom-padding)),env(safe-area-inset-bottom))}
    }
    @media screen and (max-width:480px){input,textarea,select{font-size:16px!important}}
    @media (prefers-reduced-motion: reduce){
      *,*::before,*::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}
    }

    /* ── Double-tap-zoom prevention (pinch-to-zoom PRESERVED per WCAG 1.4.4) ── */
    html{touch-action:pan-x pan-y pinch-zoom;-ms-touch-action:pan-x pan-y pinch-zoom}
    *{-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}
    input,textarea,select,[contenteditable]{-webkit-user-select:text;user-select:text}

    /* ── WCAG 2.4.7: Focus Visible — high-contrast keyboard focus ring ── */
    :focus-visible{
      outline:3px solid ${T.accent.primary};
      outline-offset:2px;
      border-radius:4px;
    }
    /* Remove focus ring for mouse/touch (only :focus-visible above applies for keyboard) */
    :focus:not(:focus-visible){outline:none;}

    /* ── Premium Input Focus Glow ── */
    input:focus,textarea:focus,select:focus{
      border-color:${T.accent.primary} !important;
      box-shadow:inset 0 2px 4px rgba(0,0,0,0.3), 0 0 0 3px ${T.accent.primaryGlow}, 0 0 16px ${T.accent.primaryDim} !important;
      transition:border-color .2s ease, box-shadow .3s var(--spring-elastic) !important;
    }

    /* ── Card Press Feedback (for tappable cards) ── */
    .card-press{
      transition:transform .3s var(--spring-elastic), box-shadow .3s ease !important;
      cursor:pointer;
      will-change: transform;
    }
    .card-press:active{
      transform:scale(0.95) translateZ(0) !important;
      box-shadow:0 2px 8px rgba(0,0,0,0.5) !important;
      transition:transform .1s cubic-bezier(0.4,0,0.2,1), box-shadow .1s ease !important;
    }

    /* ── CTA Shimmer Button — draws attention to primary actions ── */
    .cta-shimmer{
      position:relative;
      overflow:hidden;
    }
    .cta-shimmer::after{
      content:'';
      position:absolute;
      inset:0;
      background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.15) 50%,transparent 60%);
      background-size:200% 100%;
      animation:ctaShimmer 3s ease-in-out infinite;
      pointer-events:none;
      border-radius:inherit;
    }

    /* ── Nav Active Dot Indicator ── */
    .nav-active-dot::after{
      content:'';
      position:absolute;
      bottom:2px;
      left:50%;
      transform:translateX(-50%);
      width:4px;
      height:4px;
      border-radius:2px;
      background:${T.accent.primary};
      opacity:0;
      transition:opacity .3s ease, transform .3s var(--spring-elastic);
    }
    .nav-active-dot[data-active="true"]::after{
      opacity:1;
      transform:translateX(-50%) scale(1);
    }
    .shell-breathe{
      animation:shellBreathe 5s ease-in-out infinite;
    }

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
        padding-bottom:max(var(--page-bottom-padding), env(keyboard-inset-height,0px));
      }
    }
  `}</style>
);

export const Card = ({ children, style, animate, delay = 0, onClick, variant = "default", className = "" }: CardProps) => {
  const variants = {
    default: {
      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
      border: `1px solid ${T.border.default}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(255,255,255,0.02), ${T.shadow.card}`,
    },
    elevated: {
      background: `linear-gradient(180deg, ${T.bg.elevated}, ${T.bg.card})`,
      border: `1px solid ${T.border.default}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.02), ${T.shadow.elevated}`,
    },
    glass: {
      background: `linear-gradient(180deg, ${T.bg.glass}, ${T.bg.card})`,
      border: `1px solid ${T.border.default}`,
      backdropFilter: "blur(26px) saturate(1.25)",
      WebkitBackdropFilter: "blur(26px) saturate(1.25)",
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(255,255,255,0.02), ${T.shadow.card}`,
    },
    accent: {
      background: `linear-gradient(165deg, ${T.accent.primaryDim}, ${T.bg.card} 58%, ${T.accent.emeraldDim})`,
      border: `1px solid ${T.accent.primarySoft}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), ${T.shadow.card}, 0 0 24px rgba(123,94,167,0.06)`,
    },
  };
  const v = variants[variant] || variants.default;

  return (
    <div
      onClick={e => {
        if (onClick) {
          haptic.selection();
          // Note: using selection() for lightweight UI interactions (tabs, cards) instead of impact, which is heavier
          onClick(e);
        }
      }}
      onKeyDown={
        onClick
          ? e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              haptic.selection();
              onClick(e);
            }
          }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`${animate ? "slide-up " : ""}${onClick ? "hover-card " : ""}${className}`.trim()}
      style={{
        ...v,
        borderRadius: T.radius.lg,
        padding: "clamp(15px, 2.6vw, 18px)",
        marginBottom: 10,
        ...style,
        ...(onClick ? { cursor: "pointer", position: "relative" } : {}),
        ...(animate ? { animationDelay: `${delay}ms` } : {}),
      }}
    >
      {children}
    </div>
  );
};

export const Label = ({ children, style }: LabelProps) => (
  <label
    style={{
      display: "block",
      fontSize: 10,
      fontWeight: 800,
      color: T.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      marginBottom: 8,
      fontFamily: T.font.mono,
      ...style,
    }}
  >
    {children}
  </label>
);

// Unified ErrorBoundary — delegates to standalone module with error telemetry (reportError)
  export { default as ErrorBoundary } from "./ErrorBoundary.js";

export const Badge = ({ variant = "gray", children, style, size = "md" }: BadgeProps) => {
  const m = {
    green: { bg: T.status.greenDim, c: T.status.green },
    amber: { bg: T.status.amberDim, c: T.status.amber },
    red: { bg: T.status.redDim, c: T.status.red },
    blue: { bg: T.status.blueDim, c: T.status.blue },
    purple: { bg: T.status.purpleDim, c: T.status.purple },
    gray: { bg: "rgba(110,118,129,0.08)", c: T.text.secondary },
    teal: { bg: T.accent.primaryDim, c: T.accent.primary },
    gold: { bg: T.accent.copperDim, c: T.accent.copper },
    outline: { bg: "transparent", c: T.text.secondary },
    success: { bg: T.status.greenDim, c: T.status.green },
  };
  const s = m[variant] || m.gray;
  const padding = size === "sm" ? "2px 7px" : size === "lg" ? "4px 11px" : "3px 9px";
  const fontSize = size === "sm" ? 9 : size === "lg" ? 11 : 10;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding,
        borderRadius: 6,
        fontSize,
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

export const NoticeBanner = ({ tone = "info", title, message, action, compact = false, style }: NoticeBannerProps) => {
  const palette = {
    info: { border: T.accent.primarySoft, bg: T.accent.primaryDim, accent: T.accent.primary },
    success: { border: `${T.status.green}35`, bg: T.status.greenDim, accent: T.status.green },
    warning: { border: `${T.status.amber}35`, bg: T.status.amberDim, accent: T.status.amber },
    error: { border: `${T.status.red}35`, bg: T.status.redDim, accent: T.status.red },
  }[tone];

  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "12px 14px",
        borderRadius: T.radius.md,
        border: `1px solid ${palette.border}`,
        background: `linear-gradient(180deg, ${palette.bg}, ${T.bg.card})`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: action ? "flex-start" : "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {title ? (
            <div
              style={{
                fontSize: compact ? 11 : 12,
                fontWeight: 800,
                color: palette.accent,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginBottom: message ? 4 : 0,
                fontFamily: T.font.mono,
              }}
            >
              {title}
            </div>
          ) : null}
          {message ? (
            <div style={{ fontSize: compact ? 11 : 12, lineHeight: 1.55, color: T.text.secondary }}>
              {message}
            </div>
          ) : null}
        </div>
        {action ? <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{action}</div> : null}
      </div>
    </div>
  );
};

export const ListSection = ({ children, style }: ListSectionProps) => (
  <div
    style={{
      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.elevated})`,
      borderRadius: T.radius.xl,
      border: `1px solid ${T.border.subtle}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${T.shadow.card}`,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

export const ListRow = ({ icon, title, description, value, action, onClick, style, isLast = false }: ListRowProps) => {
  const content = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
        {icon ? <div style={{ flexShrink: 0 }}>{icon}</div> : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          {title ? <div style={{ fontSize: 14, fontWeight: 750, color: T.text.primary, lineHeight: 1.25 }}>{title}</div> : null}
          {description ? (
            <div style={{ fontSize: 11, color: T.text.secondary, lineHeight: 1.45, marginTop: title ? 3 : 0 }}>
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {value ? (
        <div style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.text.secondary, fontFamily: T.font.mono }}>
          {value}
        </div>
      ) : null}
      {action ? <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{action}</div> : null}
    </>
  );

  const rowStyle: CSSProperties = {
    width: "100%",
    minHeight: 68,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
    background: "transparent",
    border: "none",
    borderBottom: isLast ? "none" : `1px solid ${T.border.subtle}`,
    textAlign: "left",
    cursor: onClick ? "pointer" : "default",
    ...style,
  };

  if (onClick) {
    return (
      <button className="settings-row hover-btn" onClick={onClick} style={rowStyle}>
        {content}
      </button>
    );
  }
  return <div style={rowStyle}>{content}</div>;
};

export const ProgressBar = ({ progress = 0, color = T.accent.primary, style }) => (
  <div style={{ height: 6, background: T.bg.surface, borderRadius: 3, overflow: "hidden", ...style }}>
    <div
      style={{
        height: "100%",
        width: `${Math.min(Math.max(progress, 0), 100)}%`,
        background: color,
        borderRadius: 3,
        transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1), background 0.5s ease",
      }}
    />
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 100/100 ELITE SKELETON LOADER
// Apple-style shimmering skeleton for loading states, replacing spinners.
// ═══════════════════════════════════════════════════════════════
export const Skeleton = ({ width = "100%", height = 24, borderRadius = 8, style, isCircle = false }: SkeletonProps) => (
  <div
    style={{
      width,
      height,
      borderRadius: isCircle ? "50%" : borderRadius,
      background: `linear-gradient(90deg, ${T.bg.elevated} 25%, ${T.border.default} 50%, ${T.bg.elevated} 75%)`,
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite linear",
      opacity: 0.6,
      ...style,
    }}
  />
);

export const InlineTooltip = ({ term, children }: InlineTooltipProps) => {
  const descriptions: Record<string, string> = {
    Floor: "The absolute minimum balance you require in your checking account after all obligations.",
    Available: "Cash technically in your account, but potentially reserved by upcoming bills or floors.",
    "Available Capital": "Your checking balance minus your global floor and buffers.",
    "Promo sprint":
      "Accelerated payoff of a 0% APR card right before the promo period ends to avoid deferred interest.",
    "Sinking fund": "Money incrementally saved for a known future expense.",
    "Emergency reserve": "Your liquid safety net, usually kept in a High-Yield Savings Account (HYSA).",
  };
  const [show, setShow] = React.useState(false);
  const text = term ? (descriptions[term] || term) : "";
  const tooltipId = `tooltip-${(term || "").replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <span
      className="inline-tooltip-wrapper"
      tabIndex={0}
      role="button"
      aria-describedby={show ? tooltipId : undefined}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setShow(!show);
        }
        if (e.key === "Escape") setShow(false);
      }}
      onClick={e => {
        e.stopPropagation();
        setShow(!show);
      }}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        cursor: "help",
        borderBottom: `1px dotted ${T.text.secondary}`,
        color: "inherit",
        zIndex: show ? 50 : 1,
      }}
    >
      {children || term}
      {show && (
        <span
          id={tooltipId}
          role="tooltip"
          className="fade-in"
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: 8,
            padding: "8px 12px",
            background: T.bg.elevated,
            color: T.text.secondary,
            fontSize: 11,
            fontWeight: 500,
            fontFamily: T.font.sans,
            lineHeight: 1.4,
            borderRadius: 8,
            border: `1px solid ${T.border.default}`,
            boxShadow: T.shadow.elevated,
            width: "max-content",
            maxWidth: 260,
            zIndex: 100,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {text}
          <svg
            style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)" }}
            width="10"
            height="5"
            viewBox="0 0 10 5"
            fill="none"
          >
            <path d="M0 0L5 5L10 0H0Z" fill={T.bg.elevated} />
            <path d="M0 0L5 5L10 0" stroke={T.border.default} />
          </svg>
        </span>
      )}
    </span>
  );
}

  export { ViewToggle } from "./uiComponents.js";

// ═══════════════════════════════════════════════════════════════
// IOS-STYLE SETTINGS / EDIT PANELS
// ═══════════════════════════════════════════════════════════════

export function FormGroup({ children, label, style }: FormGroupProps) {
  return (
    <div style={{ marginBottom: 24, ...style }}>
      {label && (
        <div style={{
          fontSize: 12,
          fontWeight: 800,
          color: T.text.secondary,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
          paddingLeft: 4,
          fontFamily: T.font.sans,
        }}>
          {label}
        </div>
      )}
      <div style={{
        background: T.bg.elevated,
        borderRadius: T.radius.lg,
        border: `1px solid ${T.border.subtle}`,
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

export function FormRow({ icon: Icon, label, children, isLast = false, onClick, style }: FormRowProps) {
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {Icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${T.accent.primaryDim}, ${T.accent.primary}10)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={14} color={T.accent.primary} strokeWidth={2.5} />
          </div>
        )}
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text.primary, fontFamily: T.font.sans }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        {children}
      </div>
    </>
  );

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    minHeight: 52,
    borderBottom: isLast ? "none" : `1px solid ${T.border.subtle}`,
    background: "transparent",
    width: "100%",
    borderTop: "none", borderLeft: "none", borderRight: "none",
    textAlign: "left",
    cursor: onClick ? "pointer" : "default",
    ...style
  };

  if (onClick) {
    return (
      <button className="hover-btn" onClick={onClick} style={rowStyle}>
        {inner}
      </button>
    );
  }

  return <div style={rowStyle}>{inner}</div>;
};
