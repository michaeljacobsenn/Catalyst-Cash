import type { CSSProperties, ComponentType } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  Clock,
  Check,
  Cloud,
  Coffee,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Fuel,
  Gift,
  Home,
  Info,
  Landmark,
  Layers,
  Link2,
  Lock,
  MapPin,
  MessageCircle,
  Pencil,
  PiggyBank,
  Plane,
  Repeat,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Smartphone,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Utensils,
  Wallet,
  X,
  Zap,
} from "./icons.js";

interface UiGlyphProps {
  glyph?: string | null | undefined;
  size?: number;
  color?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

type GlyphIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number; style?: CSSProperties }>;

const GLYPH_ICON_MAP: Record<string, GlyphIcon> = {
  "⚡": Zap,
  "⚠": AlertTriangle,
  "⏰": Clock,
  "⏳": Clock,
  "✅": Check,
  "✓": Check,
  "✕": X,
  "✎": Pencil,
  "🔒": Lock,
  "🌊": Layers,
  "📈": TrendingUp,
  "📉": TrendingDown,
  "🪄": Sparkles,
  "✨": Sparkles,
  "🎉": Sparkles,
  "🌱": Sparkles,
  "⚖": Shield,
  "🏆": Target,
  "💰": DollarSign,
  "💵": Banknote,
  "📍": MapPin,
  "🔔": AlertCircle,
  "📊": Activity,
  "💬": MessageCircle,
  "🧠": Cpu,
  "📜": Database,
  "⚙": Settings,
  "🏦": Landmark,
  "🧾": ReceiptText,
  "📒": Database,
  "💳": CreditCard,
  "🔁": RefreshCw,
  "📅": Calendar,
  "📤": Upload,
  "🛡": Shield,
  "👋": Sparkles,
  "📥": Download,
  "🧑‍💻": Cpu,
  "🎯": Target,
  "🔥": Zap,
  "💪": Activity,
  "👑": Shield,
  "🚀": TrendingUp,
  "🚨": AlertTriangle,
  "🔍": Search,
  "🛑": AlertCircle,
  "🍳": Sparkles,
  "📵": Smartphone,
  "☕": Coffee,
  "📦": Database,
  "🥘": Utensils,
  "🔮": Sparkles,
  "🏁": Target,
  "📱": Smartphone,
  "💧": DropletFallback,
  "☁": Cloud,
  "📗": FileSpreadsheet,
  "📄": FileText,
  "🔑": Lock,
  "ℹ": Info,
  "💡": Sparkles,
  "🏠": Home,
  "🏢": Building2,
  "🍔": Wallet,
  "🛍": ShoppingCart,
  "🚗": Building2,
  "✈": Plane,
  "🏖": Sun,
  "🧭": MapPin,
  "💸": Wallet,
  "📋": FileText,
  "📁": FileText,
  "🔗": Link2,
  "📡": Smartphone,
  "🎬": Sparkles,
  "🎵": Sparkles,
  "💊": Shield,
  "👴": PiggyBank,
  "🎁": Gift,
  "🐾": Sparkles,
  "📚": FileText,
  "🛒": ShoppingCart,
  "⛽": Fuel,
  "🔄": Repeat,
  "🎭": Sparkles,
  "🏰": Landmark,
  "🦉": Sparkles,
  "✂": Pencil,
};

function DropletFallback({ size = 16, color = "currentColor", strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5C9.5 6 6 9.4 6 13.2A6 6 0 0 0 18 13.2C18 9.4 14.5 6 12 2.5Z" />
    </svg>
  );
}

function normalizeGlyph(glyph: string) {
  return glyph.replace(/\uFE0F/g, "").trim();
}

export default function UiGlyph({ glyph, size = 16, color = "currentColor", style, strokeWidth = 2 }: UiGlyphProps) {
  const normalized = normalizeGlyph(glyph || "");
  const Icon = GLYPH_ICON_MAP[normalized];

  if (Icon) {
    return <Icon size={size} color={color} strokeWidth={strokeWidth} {...(style ? { style } : {})} />;
  }

  if (!normalized) return null;

  return (
    <span aria-hidden="true" style={{ display: "inline-flex", lineHeight: 1, ...style }}>
      {normalized}
    </span>
  );
}
