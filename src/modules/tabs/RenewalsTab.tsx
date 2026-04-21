import React, {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { CatalystCashConfig, Renewal } from "../../types/index.js";

import { EmptyState as UIEmptyState, Mono as UIMono } from "../components.js";
import { formatInterval, T } from "../constants.js";
import { useAudit } from "../contexts/AuditContext.js";
import { useNavigation } from "../contexts/NavigationContext.js";
import { usePortfolio } from "../contexts/PortfolioContext.js";
import { haptic } from "../haptics.js";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout.js";
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Plus,
  X,
  Zap,
} from "../icons";
import { getNegotiableMerchant } from "../negotiation.js";
import {
  resolveRenewalPaymentState,
} from "../renewalPaymentSources.js";
import { shouldShowGating } from "../subscription.js";
import UiGlyph from "../UiGlyph.js";
import { Badge as UIBadge, Card as UICard } from "../ui.js";
import { useSubscriptions } from "../useSubscriptions.js";
import { fmt } from "../utils.js";
import ProBanner from "./ProBanner.js";
import {
  buildNewRenewal,
  buildRenewalDraft,
  getCancelUrl,
} from "./renewals/helpers";
import {
  buildGroupedRenewalItems,
  buildRenewalGroups,
  calculateMonthlyRenewalTotal,
  countActiveRenewalItems,
  countInactiveRenewalItems,
  createEmptyRenewalFormState,
  isInactiveRenewal,
  RENEWAL_CATEGORY_OPTIONS,
  RENEWAL_SORT_LABELS,
  type GroupedRenewalItem,
  type RenewalDraftState,
  type SortMode,
} from "./renewals/model";
import {
  RenewalDetailsFields,
  RenewalPaymentFields,
  RenewalScheduleFields,
} from "./renewals/editorSections";

const LazyProPaywall = React.lazy(() => import("./ProPaywall.js"));

interface RenewalsTabProps {
  proEnabled?: boolean;
  embedded?: boolean;
  privacyMode?: boolean;
  themeTick?: number;
}

interface NegotiationSheetState {
  merchant: string;
  type: string;
  tactic: string;
  amount: number;
  name: string;
}

interface NegotiationFlowPayload {
  merchant: string;
  amount: number;
  tactic: string;
  financialContext?: Partial<CatalystCashConfig> | null;
}

type EditRenewalState = RenewalDraftState;
type AddRenewalState = RenewalDraftState;

interface SubscriptionSuggestion {
  id: string;
  name: string;
  amount: number;
  interval: number;
  intervalUnit: string;
  cadence: string;
  category?: string;
  source?: string;
  chargedTo?: string;
  chargedToId?: string;
  chargedToType?: string;
  nextDue?: string;
  txDate: string;
  confidence: number;
}

function ScrollLock() {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return null;
}

interface CardProps {
  children?: ReactNode;
  animate?: boolean;
  delay?: number;
  variant?: string;
  style?: CSSProperties;
  className?: string;
}


interface BadgeProps {
  children?: ReactNode;
  variant?: string;
  size?: string;
  style?: CSSProperties;
}

interface MonoProps {
  children?: ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  style?: CSSProperties;
}

interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  title?: ReactNode;
  message?: ReactNode;
}

const Card = UICard as unknown as (props: CardProps) => ReactNode;
const Badge = UIBadge as unknown as (props: BadgeProps) => ReactNode;
const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const EmptyState = UIEmptyState as unknown as (props: EmptyStateProps) => ReactNode;

function formatRenewalDueDate(dateValue?: string) {
  if (!dateValue) return "";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default memo(function RenewalsTab({
  proEnabled = false,
  embedded = false,
  privacyMode: _privacyModeTick = false,
  themeTick = 0,
}: RenewalsTabProps) {
  void _privacyModeTick;
  const { current } = useAudit();
  const portfolioContext = usePortfolio();
  const { navTo } = useNavigation();
  const { isNarrowPhone, isTablet } = useResponsiveLayout();

  const [negotiateSheet, setNegotiateSheet] = useState<NegotiationSheetState | null>(null);

  const isDemo = !!current?.isTest;

  // Demo mode: use local state so cancel/restore/delete actually work
  const [demoRenewals, setDemoRenewals] = useState<Renewal[]>(() => current?.demoPortfolio?.renewals || []);
  // Reset demo renewals if the demo data changes
  useEffect(() => {
    if (isDemo) setDemoRenewals(current?.demoPortfolio?.renewals || []);
  }, [isDemo, current?.demoPortfolio?.renewals]);

  const renewals = isDemo ? demoRenewals : portfolioContext.renewals;
  const setRenewals = isDemo ? setDemoRenewals : portfolioContext.setRenewals;
  const cards = isDemo ? current.demoPortfolio?.cards || [] : portfolioContext.cards;
  const bankAccounts = isDemo ? current.demoPortfolio?.bankAccounts || [] : portfolioContext.bankAccounts;
  const { cardAnnualFees } = portfolioContext;
  const [editing, setEditing] = useState<number | null>(null); // index within user renewals
  const [editVal, setEditVal] = useState<EditRenewalState>(() => createEmptyRenewalFormState());
  const [showAdd, setShowAdd] = useState<boolean>(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [addForm, setAddForm] = useState<AddRenewalState>(() => createEmptyRenewalFormState());
  const [sortBy, setSortBy] = useState<SortMode>("type");
  const [editStep, setEditStep] = useState<number>(0);

  const formInputStyle: CSSProperties = {
    flex: 1,
    border: "none",
    background: "transparent",
    color: T.text.primary,
    fontSize: 14,
    fontWeight: 600,
    textAlign: "right",
    outline: "none",
    padding: 0,
    minWidth: 50,
  };

  const renewalActionButtonBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "1 1 0",
    minWidth: 0,
    height: 28,
    minHeight: 28,
    maxHeight: 28,
    padding: "0 8px",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textDecoration: "none",
    letterSpacing: "-0.01em",
    background: "transparent",
    border: `1px solid ${T.border.subtle}`,
    boxShadow: "none",
    boxSizing: "border-box",
    fontFamily: T.font.sans,
    lineHeight: "28px",
    appearance: "none",
    WebkitAppearance: "none",
    margin: 0,
    cursor: "pointer",
    verticalAlign: "middle",
  };

  // Auto-archive expired one-time items (runs as effect, not during render)
  useEffect(() => {
    if (!renewals?.length) return;
    const today = new Date().toISOString().slice(0, 10);
    setRenewals((prev) => {
      if (!prev?.length) return prev;
      let changed = false;
      const next = prev.map((renewal) => {
        const isExpired = renewal.intervalUnit === "one-time" && renewal.nextDue && renewal.nextDue < today && !renewal.isCancelled;
        if (isExpired && !renewal.archivedAt) {
          changed = true;
          return { ...renewal, archivedAt: today };
        }
        return renewal;
      });
      return changed ? next : prev;
    });
  }, [renewals, setRenewals]);

  const renewalCategoryMeta = useMemo(
    () => ({
      housing: { label: "Housing & Utilities", color: T.status.red },
      subs: { label: "Subscriptions", color: T.accent.primary },
      insurance: { label: "Insurance", color: T.status.amber },
      transport: { label: "Transportation", color: T.status.blue },
      essentials: { label: "Groceries & Essentials", color: T.status.green },
      medical: { label: "Medical & Health", color: T.accent.emerald },
      sinking: { label: "Sinking Funds", color: T.status.purple },
      onetime: { label: "One-Time Expenses", color: T.status.amber },
      inactive: { label: "Inactive & History", color: T.text.muted },
      // Legacy aliases for backward compatibility
      fixed: { label: "Housing & Utilities", color: T.status.red },
      monthly: { label: "Housing & Utilities", color: T.status.red },
      cadence: { label: "Subscriptions", color: T.accent.primary },
      periodic: { label: "Subscriptions", color: T.accent.primary },
      af: { label: "Annual Fees", color: T.accent.copper || T.status.amber },
    }),
    [themeTick]
  );
  const categorySelectOptions = useMemo(
    () => RENEWAL_CATEGORY_OPTIONS.map((category) => ({ value: category.id, label: category.label })),
    []
  );
  const allItems = useMemo<GroupedRenewalItem[]>(
    () => buildGroupedRenewalItems(renewals || [], cardAnnualFees || []),
    [renewals, cardAnnualFees]
  );
  const activeItemCount = useMemo(() => countActiveRenewalItems(allItems), [allItems]);
  const inactiveItemCount = useMemo(() => countInactiveRenewalItems(allItems), [allItems]);
  const grouped = useMemo(
    () =>
      buildRenewalGroups(allItems, {
        sortBy,
        showInactive,
        categoryMeta: renewalCategoryMeta,
      }),
    [allItems, renewalCategoryMeta, showInactive, sortBy]
  );
  const monthlyTotal = useMemo(() => calculateMonthlyRenewalTotal(allItems), [allItems]);
  const nextDueItem = useMemo(
    () =>
      [...allItems]
        .filter((item) => !isInactiveRenewal(item) && item.nextDue)
        .sort((left, right) => (left.nextDue || "9999-99-99").localeCompare(right.nextDue || "9999-99-99"))[0] || null,
    [allItems]
  );
  const weeklyRunRate = monthlyTotal / 4.33;
  const annualRunRate = monthlyTotal * 12;
  const averageActiveItemMonthly = activeItemCount > 0 ? monthlyTotal / activeItemCount : 0;

  const startEdit = useCallback(
    (item: GroupedRenewalItem, renewalIndex: number | null | undefined) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      setEditing(renewalIndex);
      setEditStep(0);
      const paymentState = resolveRenewalPaymentState(item, cards || [], bankAccounts || []);
      setEditVal({
        name: item.name,
        amount: String(item.amount),
        interval: item.interval || 1,
        intervalUnit: item.intervalUnit || "months",
        source: item.source || "",
        chargedTo: paymentState.chargedTo,
        chargedToId: paymentState.chargedToId,
        chargedToType: paymentState.chargedToType,
        nextDue: item.nextDue || "",
        category: item.category || "subs",
      });
    },
    [bankAccounts, cards]
  );
  const saveEdit = useCallback(
    (renewalIndex: number | null | undefined, fallbackName: string | undefined) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      const paymentState = resolveRenewalPaymentState(editVal, cards || [], bankAccounts || []);
      setRenewals((prev) =>
        (prev || []).map((r, idx) =>
          idx === renewalIndex ? buildRenewalDraft(r, { ...editVal, ...paymentState }, fallbackName) : r
        )
      );
      setEditing(null);
    },
    [bankAccounts, cards, editVal, setRenewals]
  );
  const removeItem = useCallback(
    (renewalIndex: number | null | undefined, itemName: string | undefined) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
      setRenewals(prev => (prev || []).filter((_, idx) => idx !== renewalIndex));
    },
    [setRenewals]
  );


  const addItem = (): void => {
    if (!addForm.name.trim() || !addForm.amount) return;
    const paymentState = resolveRenewalPaymentState(addForm, cards || [], bankAccounts || []);
    const label = paymentState.chargedTo;
    const newItem = buildNewRenewal({ ...addForm, ...paymentState }, label);
    setRenewals((prev) => [...(prev || []), newItem]);
    setAddForm(createEmptyRenewalFormState());
    setShowAdd(false);
  };

  const { detected, dismissSuggestion } = useSubscriptions(renewals, cards, bankAccounts, proEnabled) as {
    detected: SubscriptionSuggestion[];
    dismissSuggestion: (suggestionId: string) => void;
  };

  const negotiateSheetOverlay =
    negotiateSheet && typeof document !== "undefined"
      ? createPortal(
          <>
            <ScrollLock />
            <div
              onClick={() => { setNegotiateSheet(null); haptic.light(); }}
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                animation: "fadeIn .2s ease",
                touchAction: "none",
              }}
            />
            <div
              style={{
                position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
                background: T.bg.card,
                borderTop: `1px solid ${T.border.default}`,
                borderRadius: `${T.radius.xl}px ${T.radius.xl}px 0 0`,
                padding: "0 0 env(safe-area-inset-bottom, 20px)",
                maxHeight: "82vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 -8px 40px rgba(0,0,0,0.45)",
                animation: "slideUp .3s cubic-bezier(.16,1,.3,1)",
                overscrollBehavior: "contain",
              }}
            >
              <style>{`
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
              `}</style>

              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border.default }} />
              </div>

              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 20px 12px",
                borderBottom: `1px solid ${T.border.subtle}`,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Bot size={16} color={T.accent.primary} />
                    <span style={{ fontSize: 16, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.02em" }}>
                      {negotiateSheet.merchant}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                      color: T.accent.primary, background: T.accent.primaryDim,
                      border: `1px solid ${T.accent.primary}30`,
                      padding: "2px 7px", borderRadius: 99,
                      fontFamily: T.font.mono,
                    }}>{ negotiateSheet.type }</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.text.dim, marginTop: 3 }}>
                    ${(negotiateSheet.amount || 0).toFixed(2)}/mo · Negotiation Playbook
                  </div>
                </div>
                <button type="button"
                  onClick={() => { setNegotiateSheet(null); haptic.light(); }}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: T.bg.elevated, border: `1px solid ${T.border.default}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: T.text.dim,
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
                <div style={{
                  background: T.bg.elevated,
                  border: `1px solid ${T.border.default}`,
                  borderRadius: T.radius.lg,
                  padding: "14px 16px",
                  marginBottom: 16,
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
                    color: T.status.green, fontFamily: T.font.mono, marginBottom: 10,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ display: "inline-block", width: 14, height: 1, background: T.status.green }} />
                    Proven Tactic
                  </div>
                  <p style={{
                    fontSize: 14, lineHeight: 1.75, color: T.text.secondary,
                    margin: 0, whiteSpace: "pre-wrap",
                  }}>
                    {negotiateSheet.tactic}
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button type="button"
                    onClick={() => {
                      if (shouldShowGating() && !proEnabled) {
                        haptic.selection();
                        setShowPaywall(true);
                        return;
                      }
                      haptic.success();
                      setNegotiateSheet(null);
                      const payload: NegotiationFlowPayload = {
                        merchant: negotiateSheet.merchant,
                        amount: negotiateSheet.amount,
                        tactic: negotiateSheet.tactic,
                        financialContext: null,
                      };
                      navTo("chat", {
                        negotiateBill: {
                          merchant: payload.merchant,
                          amount: payload.amount,
                          tactic: payload.tactic,
                        }
                      });
                    }}
                    style={{
                      width: "100%", padding: "14px",
                      borderRadius: T.radius.md, border: "none",
                      background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                      color: "#fff", fontSize: 14, fontWeight: 800,
                      cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", gap: 8,
                      boxShadow: `0 4px 16px ${T.accent.primary}40`,
                    }}
                  >
                    <Bot size={15} />
                    Generate Full AI Phone Script
                  </button>
                  <button type="button"
                    onClick={() => { setNegotiateSheet(null); haptic.light(); }}
                    style={{
                      width: "100%", padding: "12px",
                      borderRadius: T.radius.md,
                      border: `1px solid ${T.border.default}`,
                      background: "transparent",
                      color: T.text.secondary, fontSize: 13, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Got It
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div className="page-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              paddingTop: embedded ? 10 : 16,
              paddingBottom: embedded ? 12 : 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Badge variant="outline" style={{ fontSize: 11, background: T.bg.elevated }}>
                {activeItemCount} Active Item{activeItemCount === 1 ? "" : "s"}
              </Badge>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                onClick={() => setShowAdd(!showAdd)}
                style={{
                  margin: 0,
                  padding: 0,
                  borderRadius: 100,
                  background: showAdd ? T.status.amberDim : T.bg.elevated,
                  border: `1px solid ${showAdd ? T.status.amber + "40" : T.border.default}`,
                  color: showAdd ? T.status.amber : T.text.primary,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: T.font.sans,
                  cursor: "pointer",
                  height: 32,
                  width: 105,
                  minWidth: 105,
                  maxWidth: 105,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  boxSizing: "border-box",
                  outline: "none",
                  WebkitAppearance: "none",
                  transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {showAdd ? <X size={14} style={{ flexShrink: 0 }} /> : <Plus size={14} style={{ flexShrink: 0 }} />}
                <span style={{ transform: "translateY(1px)" }}>{showAdd ? "Cancel" : "Add"}</span>
              </div>
              <div style={{ position: "relative", width: 105, minWidth: 105, maxWidth: 105, height: 32, flexShrink: 0, margin: 0, padding: 0, boxSizing: "border-box" }}>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortMode)}
                  aria-label="Sort order"
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    margin: 0,
                    padding: 0,
                    border: "none",
                    outline: "none",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    zIndex: 2,
                    WebkitAppearance: "none",
                  }}
                >
                  <option value="type">Sort: Type</option>
                  <option value="date">Sort: Date</option>
                  <option value="amount">Sort: Amt</option>
                  <option value="name">Sort: A-Z</option>
                </select>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: T.bg.elevated,
                    border: `1px solid ${T.border.default}`,
                    borderRadius: 100,
                    boxSizing: "border-box",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", position: "relative" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, color: T.text.primary, transform: "translate(-2px, 1px)" }}>
                      {RENEWAL_SORT_LABELS[sortBy]}
                    </span>
                    <ChevronDown size={14} color={T.text.muted} style={{ position: "absolute", right: 12 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

        {/* Recurring load */}
        <Card
          animate
          style={{
            padding: isNarrowPhone ? "16px 14px" : "18px 16px",
            background: `linear-gradient(160deg, ${T.bg.card}, ${T.accent.primary}05)`,
            borderColor: `${T.accent.primary}14`,
            boxShadow: `${T.shadow.elevated}, 0 0 18px ${T.accent.primaryDim}`,
            marginBottom: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                padding: "16px 16px 14px",
                borderRadius: 20,
                border: `1px solid ${T.accent.primary}18`,
                background: `linear-gradient(180deg, ${T.bg.surface}, ${T.accent.primary}10)`,
                display: "grid",
                gap: 12,
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: T.font.mono }}>
                    Recurring Load
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: isNarrowPhone ? "flex-start" : "flex-end" }}>
                  <Badge
                    variant="outline"
                    style={{
                      color: T.accent.primary,
                      borderColor: `${T.accent.primary}35`,
                      background: `${T.accent.primary}12`,
                    }}
                  >
                    {activeItemCount} Active
                  </Badge>
                  {inactiveItemCount > 0 && (
                    <Badge
                      variant="outline"
                      style={{
                        color: T.text.secondary,
                        borderColor: `${T.border.subtle}`,
                        background: T.bg.surface,
                      }}
                    >
                      {inactiveItemCount} Inactive
                    </Badge>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrowPhone
                    ? "minmax(0, 1.18fr) minmax(124px, 0.82fr)"
                    : "minmax(0, 1.28fr) minmax(168px, 0.72fr)",
                  gap: 10,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    minHeight: 116,
                    padding: "16px 16px 14px",
                    borderRadius: 18,
                    border: `1px solid ${T.accent.primary}20`,
                    background: `linear-gradient(180deg, ${T.bg.card}, ${T.accent.primary}12)`,
                    display: "grid",
                    alignContent: "space-between",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: T.font.mono }}>
                    Monthly
                  </div>
                  <Mono size={isNarrowPhone ? 28 : 31} weight={800} color={T.accent.primary}>
                    {fmt(monthlyTotal)}
                  </Mono>
                  <div style={{ fontSize: 11.5, color: T.text.secondary, lineHeight: 1.4 }}>
                    Active monthly commitments.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  {[
                    {
                      label: "Weekly",
                      value: `${fmt(weeklyRunRate)}/wk`,
                      accent: true,
                    },
                    {
                      label: "Yearly",
                      value: `${fmt(annualRunRate)}/yr`,
                      accent: false,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      style={{
                        minHeight: 53,
                        padding: "12px 14px",
                        borderRadius: 18,
                        border: `1px solid ${metric.accent ? `${T.accent.primary}24` : T.border.subtle}`,
                        background: metric.accent ? `${T.accent.primary}10` : T.bg.surface,
                        display: "grid",
                        gap: 4,
                        alignContent: "center",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {metric.label}
                      </div>
                      <Mono size={metric.accent ? 15 : 14} weight={800} color={metric.accent ? T.accent.primary : T.text.primary}>
                        {metric.value}
                      </Mono>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrowPhone
                ? "minmax(0, 1.18fr) minmax(126px, 0.82fr)"
                : isTablet
                  ? "minmax(0, 1.16fr) minmax(220px, 0.84fr)"
                  : "minmax(0, 1.16fr) minmax(168px, 0.84fr)",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                padding: "14px 14px 13px",
                borderRadius: 18,
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.surface,
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                gap: 10,
                minHeight: 150,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Due next
              </div>
              <div style={{ fontSize: isNarrowPhone ? 16 : 18, fontWeight: 800, color: T.text.primary, lineHeight: 1.18, alignSelf: "center" }}>
                {nextDueItem ? nextDueItem.name : "No due date set"}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.4 }}>
                  {nextDueItem
                    ? formatRenewalDueDate(nextDueItem.nextDue)
                    : "Set a due date to surface the next charge."}
                </div>
                {nextDueItem ? (
                  <div
                    style={{
                      minHeight: 28,
                      padding: "0 10px",
                      borderRadius: 999,
                      border: `1px solid ${T.accent.primary}24`,
                      background: `${T.accent.primary}10`,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <Mono size={11.5} weight={800} color={T.accent.primary}>
                      {fmt(nextDueItem.amount || 0)}
                    </Mono>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              style={{
                padding: "14px 14px 13px",
                borderRadius: 18,
                border: `1px solid ${T.border.subtle}`,
                background: T.bg.surface,
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                gap: 10,
                minHeight: 150,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Average item
              </div>
              <div style={{ fontSize: isNarrowPhone ? 18 : 22, fontWeight: 800, color: T.text.primary, lineHeight: 1.15, alignSelf: "center" }}>
                {fmt(averageActiveItemMonthly)}
              </div>
              <div style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.4 }}>
                Per month across {activeItemCount || 0} active {activeItemCount === 1 ? "item" : "items"}.
              </div>
            </div>
          </div>
        </Card>

        {/* Pro upsell for non-Pro users */}
        {shouldShowGating() && !proEnabled && (
          <div style={{ marginBottom: 16 }}>
            <ProBanner
              onUpgrade={() => setShowPaywall(true)}
              label="Export & Auto-Detect"
              sublabel="Pro unlocks CSV/PDF export and AI subscription detection"
            />
          </div>
        )}
        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} source="renewals" />
          </Suspense>
        )}

        {/* Detected Subscriptions (Pro Only) */}
        {proEnabled && detected && detected.length > 0 && (
          <Card
            animate
            variant="glass"
            style={{
              marginBottom: 16,
              padding: 0,
              overflow: "hidden",
              border: `1px solid ${T.accent.primary}40`,
              boxShadow: `0 0 12px ${T.accent.primary}20`
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                background: `linear-gradient(90deg, ${T.accent.primary}15, transparent)`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: `1px solid ${T.accent.primary}20`
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={14} color={T.accent.primary} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text.primary }}>
                  Detected Subscriptions
                </span>
              </div>
              <Badge variant="accent" size="sm">{detected.length} found</Badge>
            </div>
            <div style={{ padding: "8px 14px" }}>
              {detected.map((sub, i) => (
                <div
                  key={sub.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 0",
                    borderBottom: i === detected.length - 1 ? "none" : `1px solid ${T.border.subtle}`
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text.primary }}>
                      {sub.name}
                    </div>
                    <div style={{ fontSize: 12, color: T.text.dim, marginTop: 2 }}>
                      Last seen {new Date(sub.txDate).toLocaleDateString()} · {sub.chargedTo}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Mono size={14} weight={700} color={T.text.primary}>
                      {fmt(sub.amount)}
                    </Mono>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button"
                        onClick={() => {
                          setRenewals(prev => [...(prev || []), buildNewRenewal({
                            name: sub.name,
                            amount: String(sub.amount),
                            interval: sub.interval || 1,
                            intervalUnit: sub.intervalUnit || "months",
                            category: sub.category || "subs",
                            source: sub.source || "",
                            chargedTo: sub.chargedTo || "",
                            chargedToId: sub.chargedToId || "",
                            chargedToType: sub.chargedToType || "",
                            nextDue: sub.nextDue || "",
                          }, sub.chargedTo || "")]);
                          dismissSuggestion(sub.id);
                          haptic.success();
                        }}
                        style={{
                          background: T.accent.primary,
                          color: T.bg.base,
                          border: "none",
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer"
                        }}
                      >
                        <Plus size={16} />
                      </button>
                      <button type="button"
                        onClick={() => {
                          dismissSuggestion(sub.id);
                          haptic.light();
                        }}
                        style={{
                          background: T.bg.elevated,
                          color: T.text.dim,
                          border: `1px solid ${T.border.subtle}`,
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer"
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Info */}
        <Card animate delay={50} style={{ padding: "12px 16px", borderLeft: `3px solid ${T.status.green}30`, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={12} color={T.status.green} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text.secondary }}>
              Changes here are included in your audit snapshot
            </span>
          </div>
        </Card>

        {/* Add Subscription Form */}
        {showAdd && (
          <div style={{ marginBottom: 16 }}>
            <RenewalDetailsFields
              value={addForm}
              onChange={(patch) => setAddForm((currentValue) => ({ ...currentValue, ...patch }))}
              formInputStyle={formInputStyle}
              categorySelectOptions={categorySelectOptions}
            />
            <div style={{ height: 12 }} />
            <RenewalScheduleFields
              value={addForm}
              onChange={(patch) => setAddForm((currentValue) => ({ ...currentValue, ...patch }))}
              formInputStyle={formInputStyle}
            />
            <div style={{ height: 12 }} />
            <RenewalPaymentFields
              value={addForm}
              onChange={(patch) => setAddForm((currentValue) => ({ ...currentValue, ...patch }))}
              cards={cards || []}
              bankAccounts={bankAccounts || []}
              formInputStyle={formInputStyle}
            />
            <button type="button"
              onClick={addItem}
              disabled={!addForm.name.trim() || !addForm.amount}
              className="hover-lift"
              style={{
                width: "100%",
                padding: 14,
                marginTop: 12,
                borderRadius: T.radius.md,
                border: "none",
                background:
                  addForm.name.trim() && addForm.amount
                    ? `linear-gradient(135deg,${T.accent.primary},#6C60FF)`
                    : T.text.muted,
                color: addForm.name.trim() && addForm.amount ? T.bg.base : T.text.dim,
                fontSize: 13,
                fontWeight: 800,
                cursor: addForm.name.trim() && addForm.amount ? "pointer" : "not-allowed",
              }}
            >
              Add Expense
            </button>
          </div>
        )}

        {/* Categories */}
        {grouped.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={inactiveItemCount > 0 && !showInactive ? "No Active Renewals" : "Track Every Dollar"}
            message={
              inactiveItemCount > 0 && !showInactive
                ? "All tracked renewals are inactive or archived right now. Show inactive items to review the history."
                : "Add your recurring bills and subscriptions to see a clear monthly forecast across all accounts."
            }
          />
        ) : (
          grouped.map((cat) => (
            <div
              key={cat.id}
              style={{ marginBottom: 16, padding: 0, overflow: "hidden", background: "transparent" }}
            >
              <div
                style={{
                  padding: "10px 14px 6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: cat.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {cat.label}
                </span>
                <Mono size={9} color={T.text.dim}>
                  {cat.items.length}
                </Mono>
              </div>
              <div style={{ background: T.bg.card, borderRadius: T.radius.lg, overflow: "hidden", borderLeft: `3px solid ${cat.color}30` }}>
                {cat.items.map((item, i) => {
                  const renewalIndex = item.originalIndex;
                  const isUserRenewal = renewalIndex != null && renewalIndex >= 0;
                  const itemKey = item.linkedCardId
                    ? `card-af-${item.linkedCardId}`
                    : `${item.name || "item"}-${item.nextDue || ""}-${item.amount || 0}-${i}`;

                  // Find matching cancellation link (exact → partial → universal fallback)
                  const cancelUrl = item.isCancelled || item.isExpired ? null : getCancelUrl(item.name);
                  const negotiableMerchant = item.isCancelled || item.isExpired || item.isCardAF ? null : getNegotiableMerchant(item.name);
                  const emailHref =
                    cancelUrl && !cancelUrl.includes("google.com/search")
                      ? `mailto:support@${(item.name || "company").toLowerCase().replace(/[^a-z0-9]/g, "")}.com?subject=Subscription%20Cancellation%20Request&body=Hello,%0D%0A%0D%0AI%20would%20like%20to%20cancel%20my%20${encodeURIComponent(item.name || "subscription")}%20plan%20effective%20immediately.%20Please%20confirm%20when%20this%20has%20been%20processed.%0D%0A%0D%0AThank%20you.`
                      : null;
                  const actionCount = [cancelUrl, emailHref, negotiableMerchant].filter(Boolean).length;

                  return (
                    <div
                      key={itemKey}
                      style={{
                        borderBottom: i === cat.items.length - 1 ? "none" : `1px solid ${T.border.subtle}40`,
                        padding: "8px 14px",
                        animation: `fadeInUp .25s ease-out ${Math.min(i * 0.03, 0.3)}s both`,
                      }}
                    >
                      {editing === renewalIndex ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {/* ── iOS Segmented Control ── */}
                          {(() => {
                            const tabs = [
                              { label: "Details", filled: !!(editVal.name || editVal.amount || editVal.category) },
                              { label: "Schedule", filled: !!(editVal.intervalUnit || editVal.nextDue) },
                              { label: "Payment", filled: !!(editVal.chargedTo || editVal.chargedToId) },
                            ];
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  borderRadius: T.radius.md,
                                  background: `${T.bg.elevated}`,
                                  border: `1px solid ${T.border.default}`,
                                  padding: 2,
                                  position: "relative",
                                }}
                              >
                                {/* Sliding pill */}
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 2,
                                    left: `calc(${editStep * 33.33}% + 2px)`,
                                    width: "calc(33.33% - 4px)",
                                    height: "calc(100% - 4px)",
                                    borderRadius: T.radius.sm,
                                    background: T.accent.primaryDim,
                                    transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                                    zIndex: 0,
                                  }}
                                />
                                {tabs.map((tab, idx) => (
                                  <button type="button"
                                    key={idx}
                                    onClick={() => {
                                      if (typeof haptic !== "undefined") haptic.selection();
                                      setEditStep(idx);
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: "7px 0",
                                      border: "none",
                                      background: "transparent",
                                      color: editStep === idx ? T.accent.primary : T.text.dim,
                                      fontSize: 10,
                                      fontWeight: editStep === idx ? 800 : 600,
                                      cursor: "pointer",
                                      fontFamily: T.font.mono,
                                      position: "relative",
                                      zIndex: 1,
                                      transition: "color 0.2s",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: 4,
                                    }}
                                  >
                                    {tab.filled && editStep !== idx && <CheckCircle2 size={9} style={{ opacity: 0.6 }} />}
                                    {tab.label}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}

                          {/* ── Page 0: Details ── */}
                          {editStep === 0 && (
                            <RenewalDetailsFields
                              value={editVal}
                              onChange={(patch) => setEditVal((currentValue) => ({ ...currentValue, ...patch }))}
                              formInputStyle={formInputStyle}
                              categorySelectOptions={categorySelectOptions}
                            />
                          )}

                          {/* ── Page 1: Schedule ── */}
                          {editStep === 1 && (
                            <RenewalScheduleFields
                              value={editVal}
                              onChange={(patch) => setEditVal((currentValue) => ({ ...currentValue, ...patch }))}
                              formInputStyle={formInputStyle}
                            />
                          )}

                          {/* ── Page 2: Payment ── */}
                          {editStep === 2 && (
                            <RenewalPaymentFields
                              value={editVal}
                              onChange={(patch) => setEditVal((currentValue) => ({ ...currentValue, ...patch }))}
                              cards={cards || []}
                              bankAccounts={bankAccounts || []}
                              formInputStyle={formInputStyle}
                            />
                          )}

                          {/* ── Actions — always visible ── */}
                          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                            {editStep > 0 && (
                              <button type="button"
                                onClick={() => {
                                  if (typeof haptic !== "undefined") haptic.selection();
                                  setEditStep(s => s - 1);
                                }}
                                aria-label="Previous page"
                                className="btn-secondary"
                                style={{
                                  flex: 0.6,
                                  padding: 10,
                                  fontSize: 11,
                                }}
                              >
                                ← Back
                              </button>
                            )}
                            <button type="button"
                              onClick={() => {
                                saveEdit(renewalIndex, item.name);
                                setEditStep(0);
                              }}
                              className="hover-lift"
                              style={{
                                flex: 1,
                                padding: 10,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: T.accent.primaryDim,
                                color: T.accent.primary,
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              <Check size={12} />
                              Save
                            </button>
                            {editStep < 2 && (
                              <button type="button"
                                onClick={() => {
                                  if (typeof haptic !== "undefined") haptic.selection();
                                  setEditStep(s => s + 1);
                                }}
                                aria-label="Next page"
                                className="btn-secondary"
                                style={{
                                  flex: 0.6,
                                  padding: 10,
                                  fontSize: 11,
                                }}
                              >
                                Next →
                              </button>
                            )}
                            <button type="button"
                              onClick={() => {
                                setEditing(null);
                                setEditStep(0);
                              }}
                              className="btn-secondary"
                              style={{
                                flex: 0.5,
                                padding: 10,
                                fontSize: 11,
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          minHeight: 0,
                          padding: "4px 0",
                        }}>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              paddingRight: 10,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                            }}
                          >
                            {/* Top Row: Title & Badges */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
                              <span
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 700,
                                  color: item.isCancelled || item.isExpired ? T.text.muted : T.text.primary,
                                  textDecoration: item.isCancelled ? "line-through" : "none",
                                }}
                              >
                                {item.name}
                              </span>
                              {item.isCardAF && <Badge variant="gold" style={{ fontSize: 8, padding: "1px 5px" }}>AUTO</Badge>}
                              {item.isWaived && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.status.green, borderColor: `${T.status.green}40` }}>WAIVED</Badge>}
                              {item.isCancelled && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.muted, borderColor: T.border.default }}>CANCELLED</Badge>}
                              {item.isExpired && <Badge variant="outline" style={{ fontSize: 8, padding: "1px 5px", color: T.text.muted, borderColor: T.border.default }}>EXPIRED</Badge>}
                            </div>

                            {/* Metadata Container */}
                            <div style={{ display: "flex", flexWrap: "wrap", rowGap: 3, alignItems: "center" }}>
                              {([
                                {
                                  key: "cadence",
                                  node: (
                                    <Mono size={11} color={T.text.dim}>
                                      {item.cadence || formatInterval(item.interval, item.intervalUnit)}
                                    </Mono>
                                  ),
                                },
                                item.chargedTo
                                  ? {
                                      key: "card",
                                      node: (
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
                                          <CreditCard size={11} color={T.accent.primary} style={{ flexShrink: 0 }} />
                                          <span style={{ fontSize: 11, color: T.text.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {item.chargedTo.replace(/^(American Express|Barclays|Capital One|Chase|Citi|Discover) /, "")}
                                          </span>
                                        </div>
                                      ),
                                    }
                                  : null,
                                item.nextDue
                                  ? {
                                      key: "due",
                                      node: (
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <Calendar size={11} color={T.text.dim} style={{ flexShrink: 0 }} />
                                          <span style={{ fontSize: 10, fontWeight: 700, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                                            DUE {formatRenewalDueDate(item.nextDue)}
                                          </span>
                                        </div>
                                      ),
                                    }
                                  : null,
                              ].filter(Boolean) as Array<{ key: string; node: ReactNode }>).map((segment, segmentIndex) => (
                                <React.Fragment key={segment.key}>
                                  {segmentIndex > 0 && (
                                    <div
                                      aria-hidden="true"
                                      style={{
                                        width: 1,
                                        height: 10,
                                        backgroundColor: T.text.dim,
                                        opacity: 0.35,
                                        margin: "0 7px",
                                      }}
                                    />
                                  )}
                                  {segment.node}
                                </React.Fragment>
                              ))}

                              {/* Notes / Source — single-line truncated */}
                              {item.source && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", marginTop: 2 }}>
                                  <span style={{ fontSize: 11, color: T.text.muted, fontStyle: "italic", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {item.source}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons Row — compact inline */}
                            {!item.isCardAF && !item.archivedAt && actionCount > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                  marginTop: 6,
                                  width: "100%",
                                }}
                              >
                                {/* Cancel Link */}
                                {cancelUrl && (
                                  <a
                                    href={cancelUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover-btn"
                                    style={{
                                      ...renewalActionButtonBase,
                                      color: T.status.red,
                                    }}
                                  >
                                    Cancel
                                  </a>
                                )}

                                {/* Email Cancel */}
                                {emailHref && (
                                  <a
                                    href={emailHref}
                                    className="hover-btn"
                                    style={{
                                      ...renewalActionButtonBase,
                                      color: T.text.secondary,
                                    }}
                                  >
                                    Email
                                  </a>
                                )}

                                {/* Negotiate — opens inline sheet, no tab navigation */}
                                {negotiableMerchant && (
                                  <button type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (shouldShowGating() && !proEnabled) {
                                        haptic.selection();
                                        setShowPaywall(true);
                                        return;
                                      }
                                      haptic.selection();
                                      setNegotiateSheet({
                                        merchant: negotiableMerchant.merchant,
                                        type: negotiableMerchant.type,
                                        tactic: negotiableMerchant.tactic,
                                        amount: item.amount,
                                        name: item.name,
                                      });
                                    }}
                                    className="hover-btn"
                                    style={{
                                      ...renewalActionButtonBase,
                                      color: T.accent.primary,
                                      background: `${T.accent.primary}08`,
                                      border: `1px solid ${T.accent.primary}28`,
                                    }}
                                  >
                                    Negotiate
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Amount & Actions */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 6 }}>
                            <span style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: item.isCancelled || item.isExpired ? T.text.muted : T.text.primary,
                              fontFamily: T.font.mono,
                              letterSpacing: "-0.02em",
                            }}>
                              ${(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>

                            {!item.isCardAF && isUserRenewal && editing !== renewalIndex && (
                              <div style={{ display: "flex", gap: 5 }}>
                                <button type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(item, renewalIndex); }}
                                  className="hover-btn"
                                  style={{
                                    width: 26, height: 26, borderRadius: T.radius.sm,
                                    background: T.bg.base, color: T.text.secondary, border: `1px solid ${T.border.subtle}`,
                                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12,
                                  }}
                                >
                                  <UiGlyph glyph="✎" size={12} color={T.text.secondary} />
                                </button>
                                <button type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(renewalIndex, item.name); }}
                                  className="hover-btn"
                                  style={{
                                    width: 26, height: 26, borderRadius: T.radius.sm, border: "none",
                                    background: T.status.redDim, color: T.status.red,
                                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Show/Hide Inactive Button below the entire list if there are inactive items */}
        {inactiveItemCount > 0 && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24, marginBottom: 40 }}>
            <button type="button"
              onClick={() => setShowInactive(prev => !prev)}
              className="hover-btn"
              style={{
                background: "transparent",
                border: "none",
                color: T.text.dim,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {showInactive
                ? "Hide Inactive Items"
                : `Show ${inactiveItemCount} Inactive Item${inactiveItemCount === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        </div>
      </div>

      {negotiateSheetOverlay}
    </>
  );
});
