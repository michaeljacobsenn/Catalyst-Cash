  import React,{ memo,Suspense,useCallback,useEffect,useMemo,useState,type ChangeEvent,type CSSProperties,type ReactNode } from "react";
  import { createPortal } from "react-dom";
  import { EmptyState as UIEmptyState,Mono as UIMono } from "../components.js";
  import { T } from "../constants.js";
  import { formatInterval } from "../constants.js";
  import { haptic } from "../haptics.js";
  import { AlertTriangle,AlignLeft,Calendar,Check,CheckCircle2,ChevronDown,CreditCard,Plus,X } from "../icons";
  import SearchableSelectBase from "../SearchableSelect.js";
  import { shouldShowGating } from "../subscription.js";
  import { Badge as UIBadge,Card as UICard,FormGroup as UIFormGroup,FormRow as UIFormRow } from "../ui.js";
  import { fmt } from "../utils.js";
  import ProBanner from "./ProBanner.js";
const LazyProPaywall = React.lazy(() => import("./ProPaywall.js"));

  import type { Card as PortfolioCard,CatalystCashConfig,Renewal } from "../../types/index.js";
  import { useAudit } from "../contexts/AuditContext.js";
  import { useNavigation } from "../contexts/NavigationContext.js";
  import { usePortfolio } from "../contexts/PortfolioContext.js";
  import { Bot,Zap } from "../icons";
  import { getNegotiableMerchant } from "../negotiation.js";
  import {
    getBankAccountLabel,
    getRenewalPaymentOptionValue,
    parseRenewalPaymentOptionValue,
    resolveRenewalPaymentState,
    RENEWAL_PAYMENT_TYPES,
  } from "../renewalPaymentSources.js";
  import { useSubscriptions } from "../useSubscriptions.js";
  import {
    DAY_OPTIONS,
    MONTH_OPTIONS,
    WEEK_OPTIONS,
    YEAR_OPTIONS,
    buildNewRenewal,
    buildRenewalDraft,
    getCancelUrl,
    toGroupedRenewalItem,
  } from "./renewals/helpers";

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

interface EditRenewalState {
  name: string;
  amount: string;
  interval: number;
  intervalUnit: string;
  source: string;
  chargedTo: string;
  chargedToId: string;
  chargedToType: string;
  nextDue: string;
  category: string;
}

interface AddRenewalState extends EditRenewalState {}

interface GroupedRenewalItem extends Renewal {
  originalIndex?: number;
  isExpired?: boolean;
}

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

interface GroupedCategory {
  id: string;
  label: string;
  color: string;
  items: GroupedRenewalItem[];
}

interface SearchableOption {
  value: string;
  label: string;
  group?: string;
}

interface IntervalDropdownProps {
  interval: number;
  unit: string;
  onChange: (value: { interval: number; unit: string }) => void;
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

interface CardSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

type SortMode = "type" | "date" | "amount" | "name";

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options?: SearchableOption[];
  style?: CSSProperties;
  maxHeight?: number;
  displayValue?: string;
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

interface FormGroupProps {
  children?: ReactNode;
  label?: ReactNode;
}

interface FormRowProps {
  children?: ReactNode;
  label?: ReactNode;
  isLast?: boolean;
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
const FormGroup = UIFormGroup as unknown as (props: FormGroupProps) => ReactNode;
const FormRow = UIFormRow as unknown as (props: FormRowProps) => ReactNode;
const Mono = UIMono as unknown as (props: MonoProps) => ReactNode;
const EmptyState = UIEmptyState as unknown as (props: EmptyStateProps) => ReactNode;

function formatRenewalDueDate(dateValue?: string) {
  if (!dateValue) return "";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const SearchableSelect = SearchableSelectBase as unknown as (props: SearchableSelectProps) => ReactNode;

export default memo(function RenewalsTab({ proEnabled = false, embedded = false, privacyMode: _privacyModeTick = false, themeTick: _themeTick = 0 }: RenewalsTabProps) {
  void _privacyModeTick;
  void _themeTick;
  const { current } = useAudit();
  const portfolioContext = usePortfolio();
  const { navTo } = useNavigation();

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
  const [editVal, setEditVal] = useState<EditRenewalState>({
    name: "",
    amount: "",
    interval: 1,
    intervalUnit: "months",
    source: "",
    chargedTo: "",
    chargedToId: "",
    chargedToType: "",
    nextDue: "",
    category: "subs",
  });
  const [showAdd, setShowAdd] = useState<boolean>(false);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [showInactive, setShowInactive] = useState<boolean>(false);

  const [addForm, setAddForm] = useState<AddRenewalState>({
    name: "",
    amount: "",
    interval: 1,
    intervalUnit: "months",
    source: "",
    chargedTo: "",
    chargedToId: "",
    chargedToType: "",
    category: "subs",
    nextDue: "",
  });
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

  // Auto-archive expired one-time items (runs as effect, not during render)
  useEffect(() => {
    if (!renewals?.length) return;
    const now = new Date().toISOString().split("T")[0] ?? new Date().toISOString().slice(0, 10);
    let changed = false;
    const updated = renewals.map((r) => {
      const isExpired = r.intervalUnit === "one-time" && r.nextDue && r.nextDue < now && !r.isCancelled;
      if (isExpired && !r.archivedAt) {
        changed = true;
        return { ...r, archivedAt: now };
      }
      return r;
    });
    if (changed) setRenewals(updated);
  }, [renewals, setRenewals]);

  // Merge user renewals + auto-generated card annual fees
  const allItems = useMemo<GroupedRenewalItem[]>(() => {
    const now = new Date().toISOString().split("T")[0] ?? new Date().toISOString().slice(0, 10);
    const items = [...(renewals || [])].map((r, idx) => toGroupedRenewalItem(r, idx, now));
    (cardAnnualFees || []).forEach(af => {
      const exists = items.some(
        r =>
          (r.linkedCardId && af.linkedCardId && r.linkedCardId === af.linkedCardId) ||
          r.name === af.name ||
          r.linkedCardAF === af.cardName
      );
      if (!exists) items.push(toGroupedRenewalItem(af, items.length, now));
    });
    return items;
  }, [renewals, cardAnnualFees]);

  // Group by category
  const grouped = useMemo<GroupedCategory[]>(() => {
    const cats: Record<string, GroupedCategory> = {};
    const catMeta = {
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
    };

    if (sortBy !== "type") {
      const flat = [...allItems];
      if (sortBy === "name") flat.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      else if (sortBy === "date") flat.sort((a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"));
      else if (sortBy === "amount") flat.sort((a, b) => (b.amount || 0) - (a.amount || 0));
      return [{ id: "sorted", label: "All Tracked Renewals", color: T.accent.primary, items: flat }];
    }

    allItems.forEach(item => {
      if (item.isCancelled || item.isExpired) {
        if (!cats["inactive"]) cats["inactive"] = { ...catMeta.inactive, id: "inactive", items: [] };
        cats["inactive"].items.push(item);
        return;
      }
      const rawCat = item.isCardAF ? "af" : item.category || "subs";
      // Legacy category normalization
      const legacyMap = { ss: "subs", fixed: "housing", monthly: "housing", cadence: "subs", periodic: "subs" };
      const catId = legacyMap[rawCat] || rawCat;
      if (!cats[catId]) cats[catId] = { ...(catMeta[catId] || catMeta.subs), id: catId, items: [] };
      const category = cats[catId];
      if (category) category.items.push(item);
    });

    // Sort items within each category: frequency (most frequent first) → next due (soonest first) → amount (highest first)
    const toMonths = (interval, unit) => {
      const i = interval || 1;
      if (unit === "days") return i / 30.44;
      if (unit === "weeks") return i / 4.33;
      if (unit === "years") return i * 12;
      if (unit === "one-time") return 999;
      return i;
    };
    Object.values(cats).forEach((cat) => {
      cat.items.sort((a, b) => {
        // 1. Frequency: shortest interval first
        const freqA = toMonths(a.interval, a.intervalUnit);
        const freqB = toMonths(b.interval, b.intervalUnit);
        if (freqA !== freqB) return freqA - freqB;
        // 2. Next due date: soonest first (items without a date go to the end)
        const dueA = a.nextDue || "9999";
        const dueB = b.nextDue || "9999";
        if (dueA !== dueB) return dueA.localeCompare(dueB);
        // 3. Amount: highest first
        return (b.amount || 0) - (a.amount || 0);
      });
    });

    const order = [
      "housing",
      "fixed",
      "monthly",
      "medical",
      "essentials",
      "insurance",
      "transport",
      "subs",
      "ss",
      "cadence",
      "periodic",
      "sinking",
      "onetime",
      "af",
      "inactive",
    ];
    return order.filter((id) => cats[id]).map((id) => cats[id] as GroupedCategory);
  }, [allItems, sortBy]);

  const monthlyTotal = useMemo<number>(() => {
    let t = 0;
    allItems.forEach((i) => {
      if (i.isCancelled || i.isExpired) return;
      const int = i.interval || 1;
      const unit = i.intervalUnit || "months";
      if (unit === "days") t += (i.amount / int) * 30.44;
      else if (unit === "weeks") t += (i.amount / int) * 4.33;
      else if (unit === "months") t += i.amount / int;
      else if (unit === "years") t += i.amount / (int * 12);
    });
    return t;
  }, [allItems]);

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
    setRenewals([...(renewals || []), newItem]);
    setAddForm({
      name: "",
      amount: "",
      interval: 1,
      intervalUnit: "months",
      source: "",
      chargedTo: "",
      chargedToId: "",
      chargedToType: "",
      category: "subs",
      nextDue: "",
    });
    setShowAdd(false);
  };

  const IntervalDropdown = ({ interval, unit, onChange }: IntervalDropdownProps) => (
    <div style={{ display: "flex", gap: 6, flex: 1 }}>
      <select
        value={interval}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ interval: parseInt(e.target.value, 10), unit })}
        aria-label="Interval count"
        style={{
          flex: 0.4,
          padding: "10px 10px",
          borderRadius: T.radius.md,
          border: `1px solid ${T.border.default}`,
          background: T.bg.elevated,
          color: T.text.primary,
          fontSize: 13,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {(unit === "days"
          ? DAY_OPTIONS
          : unit === "weeks"
            ? WEEK_OPTIONS
            : unit === "months"
              ? MONTH_OPTIONS
              : YEAR_OPTIONS
        ).map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select
        value={unit}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ interval, unit: e.target.value })}
        aria-label="Interval unit"
        style={{
          flex: 0.6,
          padding: "10px 10px",
          borderRadius: T.radius.md,
          border: `1px solid ${T.border.default}`,
          background: T.bg.elevated,
          color: T.text.primary,
          fontSize: 13,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <option value="days">{interval === 1 ? "day" : "days"}</option>
        <option value="weeks">{interval === 1 ? "week" : "weeks"}</option>
        <option value="months">{interval === 1 ? "month" : "months"}</option>
        <option value="years">{interval === 1 ? "year" : "years"}</option>
        <option value="one-time">one-time</option>
      </select>
    </div>
  );

  const CardSelector = ({ value, onChange }: CardSelectorProps) => {
    const cardGroups: Record<string, PortfolioCard[]> = {};
    (cards || []).forEach((card) => {
      const group = `Cards · ${card.institution || "Linked"}`;
      (cardGroups[group] = cardGroups[group] || []).push(card);
    });

    const bankGroups: Record<string, typeof bankAccounts> = {};
    (bankAccounts || []).forEach((account) => {
      const group = `Banks · ${account.bank || "Linked"}`;
      (bankGroups[group] = bankGroups[group] || []).push(account);
    });

    const opts: SearchableOption[] = [
      { value: `type:${RENEWAL_PAYMENT_TYPES.checking}`, label: "Checking Account", group: "General" },
      { value: `type:${RENEWAL_PAYMENT_TYPES.savings}`, label: "Savings Account", group: "General" },
      { value: `type:${RENEWAL_PAYMENT_TYPES.cash}`, label: "Cash", group: "General" },
      ...Object.entries(bankGroups).flatMap(([group, accounts]) =>
        accounts.map((account) => ({
          value: `bank:${account.id || ""}`,
          label: getBankAccountLabel(bankAccounts || [], account),
          group,
        }))
      ),
      ...Object.entries(cardGroups).flatMap(([group, groupedCards]) =>
        groupedCards.map((card) => ({
          value: `card:${card.id || ""}`,
          label: resolveRenewalPaymentState({ chargedToType: "card", chargedToId: card.id }, cards || [], []).chargedTo,
          group,
        }))
      ),
    ];
    const displayValue = opts.find((option) => option.value === (value || ""))?.label || "";
    return (
      <SearchableSelect
        value={value || ""}
        onChange={onChange}
        placeholder="Payment method…"
        options={opts}
        displayValue={displayValue}
      />
    );
  };

  const categoryOptions = [
    { id: "housing", label: "Housing & Utilities" },
    { id: "subs", label: "Subscriptions" },
    { id: "insurance", label: "Insurance" },
    { id: "transport", label: "Transportation" },
    { id: "essentials", label: "Groceries & Essentials" },
    { id: "medical", label: "Medical & Health" },
    { id: "sinking", label: "Sinking Funds" },
    { id: "onetime", label: "One-Time Expenses" },
  ];

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
                <button
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
                  <button
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
                  <button
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
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
        {/* existing header & monthly total */}
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
              {allItems.length} Active Items
            </Badge>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              onClick={() => setShowAdd(!showAdd)}
              style={{
                margin: 0,
                padding: 0,
                borderRadius: 100, // Pill shape
                background: showAdd ? T.status.amberDim : T.bg.elevated,
                border: `1px solid ${showAdd ? T.status.amber + '40' : T.border.default}`,
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
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
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
                  borderRadius: 100, // Pill shape
                  boxSizing: "border-box",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", position: "relative" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, color: T.text.primary, transform: "translate(-2px, 1px)" }}>
                    {(() => {
                      switch (sortBy) {
                        case "date": return "Sort: Date";
                        case "amount": return "Sort: Amt";
                        case "name": return "Sort: A-Z";
                        default: return "Sort: Type";
                      }
                    })()}
                  </span>
                  <ChevronDown size={14} color={T.text.muted} style={{ position: "absolute", right: 12 }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly total */}
        <Card
          animate
          style={{
            textAlign: "center",
            padding: "22px 16px",
            background: `linear-gradient(160deg,${T.bg.card},${T.accent.primary}06)`,
            borderColor: `${T.accent.primary}12`,
            boxShadow: `${T.shadow.elevated}, 0 0 24px ${T.accent.primaryDim}`,
            marginBottom: 16
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: T.text.secondary,
              marginBottom: 6,
              fontFamily: T.font.mono,
              fontWeight: 700,
            }}
          >
            Monthly Burn Rate
          </p>
          <Mono size={30} weight={800} color={T.accent.primary}>
            {fmt(monthlyTotal)}
          </Mono>
          <Mono size={10} color={T.text.dim} style={{ display: "block", marginTop: 4 }}>
            {fmt(monthlyTotal / 4.33)}/wk · {fmt(monthlyTotal * 12)}/yr
          </Mono>
        </Card>

        {/* Pro upsell for non-Pro users */}
        {shouldShowGating() && !proEnabled && (
          <div style={{ marginBottom: 16 }}>
            <ProBanner
              onUpgrade={() => setShowPaywall(true)}
              label="⚡ Export & Auto-Detect"
              sublabel="Pro unlocks CSV/PDF export and AI subscription detection"
            />
          </div>
        )}
        {showPaywall && (
          <Suspense fallback={null}>
            <LazyProPaywall onClose={() => setShowPaywall(false)} />
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
                      <button
                        onClick={() => {
                          setRenewals(prev => [...(prev || []), buildNewRenewal({
                            name: sub.name,
                            amount: String(sub.amount),
                            interval: 1,
                            intervalUnit: "months",
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
                      <button
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
            <FormGroup label="New Bill / Subscription">
              <FormRow label="Name">
                <input
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Netflix, Rent"
                  style={formInputStyle}
                />
              </FormRow>
              <FormRow label="Amount / Cycle $">
                <input
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  value={addForm.amount}
                  onChange={e => setAddForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  style={formInputStyle}
                />
              </FormRow>
              <FormRow label="Cycle">
                <div style={{ display: "flex", justifyContent: "flex-end", flex: 1 }}>
                  <IntervalDropdown
                    interval={addForm.interval}
                    unit={addForm.intervalUnit}
                    onChange={({ interval, unit }) => setAddForm(p => ({ ...p, interval, intervalUnit: unit }))}
                  />
                </div>
              </FormRow>
              <FormRow label="Category">
                <div style={{ width: "100%", maxWidth: 160 }}>
                  <SearchableSelect
                    value={addForm.category}
                    onChange={v => setAddForm(p => ({ ...p, category: v }))}
                    placeholder="Category"
                    options={categoryOptions.map(c => ({ value: c.id, label: c.label }))}
                    displayValue={categoryOptions.find((c) => c.id === addForm.category)?.label || ""}
                  />
                </div>
              </FormRow>
              <FormRow label="Payment Method">
                <div style={{ width: "100%", maxWidth: 160 }}>
                  <CardSelector
                    value={getRenewalPaymentOptionValue(addForm)}
                    onChange={v => {
                      setAddForm(p => ({
                        ...p,
                        ...parseRenewalPaymentOptionValue(v, cards || [], bankAccounts || []),
                      }));
                    }}
                  />
                </div>
              </FormRow>
              <FormRow label="Next Due Date">
                <input
                  type="date"
                  value={addForm.nextDue}
                  onChange={e => setAddForm(p => ({ ...p, nextDue: e.target.value }))}
                  style={{ ...formInputStyle, fontFamily: T.font.sans, color: addForm.nextDue ? T.text.primary : T.text.muted }}
                />
              </FormRow>
              <FormRow label="Notes" isLast>
                <input
                  value={addForm.source}
                  onChange={e => setAddForm(p => ({ ...p, source: e.target.value }))}
                  placeholder="Optional"
                  style={formInputStyle}
                />
              </FormRow>
            </FormGroup>
            <button
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
            title="Track Every Dollar"
            message="Add your recurring bills and subscriptions to see a clear monthly forecast across all accounts."
          />
        ) : (
          grouped.map((cat) => (
            <div
              key={cat.id}
              style={{ marginBottom: 24, padding: 0, overflow: "hidden", background: "transparent" }}
            >
              <div
                style={{
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: cat.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {cat.label}
                </span>
                <Mono size={10} color={T.text.dim}>
                  {cat.items.length} items
                </Mono>
              </div>
              <div style={{ background: T.bg.card, borderRadius: T.radius.lg, overflow: "hidden" }}>
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
                        borderBottom: i === cat.items.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                        padding: "12px 16px",
                        animation: `fadeInUp .3s ease-out ${Math.min(i * 0.04, 0.4)}s both`,
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
                                  <button
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
                            <FormGroup>
                              <FormRow label="Name">
                                <input
                                  value={editVal.name}
                                  onChange={e => setEditVal(p => ({ ...p, name: e.target.value }))}
                                  placeholder="Name"
                                  aria-label="Expense name"
                                  style={formInputStyle}
                                />
                              </FormRow>
                              <FormRow label="Amount $">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  pattern="[0-9]*"
                                  value={editVal.amount}
                                  onChange={e => setEditVal(p => ({ ...p, amount: e.target.value }))}
                                  placeholder="0.00"
                                  aria-label="Amount"
                                  style={formInputStyle}
                                />
                              </FormRow>
                              <FormRow label="Category" isLast>
                                <div style={{ width: "100%", maxWidth: 160 }}>
                                  <SearchableSelect
                                    value={editVal.category || "subs"}
                                    onChange={v => setEditVal(p => ({ ...p, category: v }))}
                                    placeholder="Category"
                                    options={categoryOptions.map(c => ({ value: c.id, label: c.label }))}
                                    displayValue={categoryOptions.find((c) => c.id === (editVal.category || "subs"))?.label || ""}
                                  />
                                </div>
                              </FormRow>
                            </FormGroup>
                          )}

                          {/* ── Page 1: Schedule ── */}
                          {editStep === 1 && (
                            <FormGroup>
                              <FormRow label="Cycle">
                                <div style={{ display: "flex", justifyContent: "flex-end", flex: 1 }}>
                                  <IntervalDropdown
                                    interval={editVal.interval}
                                    unit={editVal.intervalUnit}
                                    onChange={({ interval, unit }) =>
                                      setEditVal(p => ({ ...p, interval, intervalUnit: unit }))
                                    }
                                  />
                                </div>
                              </FormRow>
                              <FormRow label="Next Due Date" isLast>
                                <input
                                  type="date"
                                  value={editVal.nextDue}
                                  onChange={e => setEditVal(p => ({ ...p, nextDue: e.target.value }))}
                                  aria-label="Next due date"
                                  style={{ ...formInputStyle, fontFamily: T.font.sans, color: editVal.nextDue ? T.text.primary : T.text.muted }}
                                />
                              </FormRow>
                            </FormGroup>
                          )}

                          {/* ── Page 2: Payment ── */}
                          {editStep === 2 && (
                            <FormGroup>
                              <FormRow label="Method">
                                <div style={{ width: "100%", maxWidth: 160 }}>
                                  <CardSelector
                                    value={getRenewalPaymentOptionValue(editVal)}
                                    onChange={v => {
                                      setEditVal(p => ({
                                        ...p,
                                        ...parseRenewalPaymentOptionValue(v, cards || [], bankAccounts || []),
                                      }));
                                    }}
                                  />
                                </div>
                              </FormRow>
                              <FormRow label="Notes" isLast>
                                <input
                                  value={editVal.source || ""}
                                  onChange={e => setEditVal(p => ({ ...p, source: e.target.value }))}
                                  placeholder="Optional"
                                  aria-label="Notes"
                                  style={formInputStyle}
                                />
                              </FormRow>
                            </FormGroup>
                          )}

                          {/* ── Actions — always visible ── */}
                          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                            {editStep > 0 && (
                              <button
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
                            <button
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
                              <button
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
                            <button
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
                          padding: "8px 0",
                        }}>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              paddingRight: 12,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                            }}
                          >
                            {/* Top Row: Title & Badges */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: item.isCancelled || item.isExpired ? T.text.muted : T.text.primary,
                                  textDecoration: item.isCancelled ? "line-through" : "none",
                                }}
                              >
                                {item.name}
                              </span>
                              {item.isCardAF && <Badge variant="gold" style={{ fontSize: 9, padding: "2px 6px" }}>AUTO</Badge>}
                              {item.isWaived && <Badge variant="outline" style={{ fontSize: 9, padding: "2px 6px", color: T.status.green, borderColor: `${T.status.green}40` }}>WAIVED</Badge>}
                              {item.isCancelled && <Badge variant="outline" style={{ fontSize: 9, padding: "2px 6px", color: T.text.muted, borderColor: T.border.default }}>CANCELLED</Badge>}
                              {item.isExpired && <Badge variant="outline" style={{ fontSize: 9, padding: "2px 6px", color: T.text.muted, borderColor: T.border.default }}>EXPIRED</Badge>}
                            </div>

                            {/* Metadata Container */}
                            <div style={{ display: "flex", flexWrap: "wrap", rowGap: 6, alignItems: "center" }}>
                              {([
                                {
                                  key: "cadence",
                                  node: (
                                    <Mono size={13} color={T.text.dim}>
                                      {item.cadence || formatInterval(item.interval, item.intervalUnit)}
                                    </Mono>
                                  ),
                                },
                                item.chargedTo
                                  ? {
                                      key: "card",
                                      node: (
                                        <div style={{ display: "flex", alignItems: "center", gap: 5, maxWidth: "100%" }}>
                                          <CreditCard size={13} color={T.accent.primary} style={{ flexShrink: 0 }} />
                                          <span style={{ fontSize: 12, color: T.text.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
                                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                          <Calendar size={13} color={T.text.dim} style={{ flexShrink: 0 }} />
                                          <span style={{ fontSize: 11, fontWeight: 700, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                                            Due {formatRenewalDueDate(item.nextDue)}
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
                                        height: 12,
                                        backgroundColor: T.text.dim,
                                        opacity: 0.5,
                                        margin: "0 10px",
                                      }}
                                    />
                                  )}
                                  {segment.node}
                                </React.Fragment>
                              ))}

                              {/* Notes / Source */}
                              {item.source && (
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, width: "100%", marginTop: 4 }}>
                                  <AlignLeft size={13} color={T.text.dim} style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span style={{ fontSize: 12, color: T.text.muted, fontStyle: "italic", lineHeight: 1.35 }}>
                                    {item.source}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons Row */}
                            {!item.isCardAF && !item.archivedAt && actionCount > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  marginTop: 10,
                                  width: "100%",
                                  maxWidth: 320,
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
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flex: "0 0 106px",
                                      width: 106,
                                      height: 34,
                                      padding: "0 10px",
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      color: T.status.red,
                                      textDecoration: "none",
                                      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.base})`,
                                      border: `1px solid ${T.status.red}30`,
                                      boxShadow: `0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
                                      boxSizing: "border-box",
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
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flex: "0 0 106px",
                                      width: 106,
                                      height: 34,
                                      padding: "0 10px",
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      color: T.text.secondary,
                                      textDecoration: "none",
                                      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.base})`,
                                      border: `1px solid ${T.border.default}`,
                                      boxShadow: `0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    Email
                                  </a>
                                )}

                                {/* Negotiate — opens inline sheet, no tab navigation */}
                                {negotiableMerchant && (
                                  <button
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
                                    className="hover-lift"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flex: "0 0 106px",
                                      width: 106,
                                      height: 34,
                                      padding: "0 10px",
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      color: T.accent.primary,
                                      textDecoration: "none",
                                      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.base})`,
                                      border: `1px solid ${T.accent.primary}40`,
                                      boxShadow: `0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
                                      cursor: "pointer",
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    Negotiate
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Amount & Actions */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                            <span style={{ fontSize: 17, fontWeight: 800, color: T.text.primary, marginBottom: 10 }}>
                              ${(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>

                            {!item.isCardAF && isUserRenewal && editing !== renewalIndex && (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(item, renewalIndex); }}
                                  className="hover-btn"
                                  style={{
                                    width: 30, height: 30, borderRadius: T.radius.md,
                                    background: T.bg.base, color: T.text.secondary, border: `1px solid ${T.border.default}`,
                                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14,
                                    boxShadow: `0 2px 4px rgba(0,0,0,0.1)`
                                  }}
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(renewalIndex, item.name); }}
                                  className="hover-btn"
                                  style={{
                                    width: 30, height: 30, borderRadius: T.radius.md, border: "none",
                                    background: T.status.redDim, color: T.status.red,
                                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                    boxShadow: `0 2px 4px rgba(0,0,0,0.1)`
                                  }}
                                >
                                  <X size={14} />
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
        {renewals.some(item => item.isCancelled || item.isExpired || item.interval === 0) && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24, marginBottom: 40 }}>
            <button
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
                ? "Hide Inactive Subscriptions"
                : `Show ${renewals.filter(i => i.isCancelled || i.isExpired || i.interval === 0).length} Inactive Subscriptions`}
            </button>
          </div>
        )}

        </div>
    </div>
    </div>

      {negotiateSheetOverlay}
    </>
  );
});
