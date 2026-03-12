import React, { useState, useEffect, useMemo, memo, useCallback, Suspense } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, X, Plus, Check, CheckCircle2, Calendar, CreditCard, AlignLeft } from "lucide-react";
import { T, RENEWAL_CATEGORIES, formatInterval } from "../constants.js";
import { fmt } from "../utils.js";
import { resolveCardLabel, getShortCardLabel } from "../cards.js";
import { Card, Label, Badge, FormGroup, FormRow } from "../ui.jsx";
import { Mono, EmptyState } from "../components.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { haptic } from "../haptics.js";
import { shouldShowGating } from "../subscription.js";
import ProBanner from "./ProBanner.jsx";
const LazyProPaywall = React.lazy(() => import("./ProPaywall.jsx"));

// Interval options for dropdowns
const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => i + 1);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEAR_OPTIONS = [1, 2, 3];
const DAY_OPTIONS = Array.from({ length: 90 }, (_, i) => i + 1);

import { usePortfolio } from "../contexts/PortfolioContext.jsx";
import { useAudit } from "../contexts/AuditContext.jsx";
import { useSubscriptions } from "../useSubscriptions.js";
import { Zap, ExternalLink, Bot } from "lucide-react";
import { getNegotiableMerchant } from "../negotiation.js";
import { useNavigation } from "../contexts/NavigationContext.jsx";

const CANCELLATION_LINKS = {
  // ── Streaming Video ──
  "netflix": "https://www.netflix.com/cancelplan",
  "hulu": "https://secure.hulu.com/account",
  "disney+": "https://www.disneyplus.com/account",
  "disney plus": "https://www.disneyplus.com/account",
  "max": "https://auth.max.com/subscription",
  "hbo max": "https://auth.max.com/subscription",
  "hbo": "https://auth.max.com/subscription",
  "peacock": "https://www.peacocktv.com/account",
  "paramount+": "https://www.paramountplus.com/account/",
  "paramount plus": "https://www.paramountplus.com/account/",
  "youtube premium": "https://www.youtube.com/paid_memberships",
  "youtube tv": "https://tv.youtube.com/welcome/",
  "youtube music": "https://www.youtube.com/paid_memberships",
  "crunchyroll": "https://www.crunchyroll.com/account/subscription",
  "funimation": "https://www.funimation.com/account/",
  "espn+": "https://plus.espn.com/account",
  "espn plus": "https://plus.espn.com/account",
  "discovery+": "https://www.discoveryplus.com/account",
  "amc+": "https://www.amcplus.com/account",
  "starz": "https://www.starz.com/account",
  "showtime": "https://www.sho.com/account",
  "britbox": "https://www.britbox.com/account",
  "mubi": "https://mubi.com/account",
  "tubi": "https://tubitv.com/account",
  "sling tv": "https://www.sling.com/account",
  "sling": "https://www.sling.com/account",
  "fubo": "https://www.fubo.tv/account",
  "fubotv": "https://www.fubo.tv/account",
  "philo": "https://www.philo.com/account",
  "dazn": "https://www.dazn.com/account",

  // ── Streaming Music & Audio ──
  "spotify": "https://www.spotify.com/us/account/subscription/",
  "apple music": "https://apps.apple.com/account/subscriptions",
  "tidal": "https://account.tidal.com/subscription",
  "pandora": "https://www.pandora.com/account/settings",
  "amazon music": "https://www.amazon.com/music/settings",
  "deezer": "https://www.deezer.com/account/subscription",
  "audible": "https://www.audible.com/account/overview",

  // ── Apple Services ──
  "apple tv+": "https://apps.apple.com/account/subscriptions",
  "apple tv": "https://apps.apple.com/account/subscriptions",
  "icloud": "https://apps.apple.com/account/subscriptions",
  "icloud+": "https://apps.apple.com/account/subscriptions",
  "apple one": "https://apps.apple.com/account/subscriptions",
  "apple arcade": "https://apps.apple.com/account/subscriptions",
  "apple fitness": "https://apps.apple.com/account/subscriptions",
  "apple news": "https://apps.apple.com/account/subscriptions",

  // ── Amazon / Shopping ──
  "amazon prime": "https://www.amazon.com/mc",
  "prime video": "https://www.amazon.com/mc",
  "prime": "https://www.amazon.com/mc",
  "kindle unlimited": "https://www.amazon.com/kindle-dbs/ku/ku-central",
  "kindle": "https://www.amazon.com/kindle-dbs/ku/ku-central",
  "walmart+": "https://www.walmart.com/plus/account",
  "walmart plus": "https://www.walmart.com/plus/account",
  "instacart": "https://www.instacart.com/store/account/instacart-plus",
  "instacart+": "https://www.instacart.com/store/account/instacart-plus",

  // ── Food Delivery ──
  "doordash": "https://www.doordash.com/consumer/membership/",
  "dashpass": "https://www.doordash.com/consumer/membership/",
  "grubhub": "https://www.grubhub.com/account/manage-membership",
  "grubhub+": "https://www.grubhub.com/account/manage-membership",

  // ── Meal Kits ──
  "blue apron": "https://www.blueapron.com/account/details",
  "home chef": "https://www.homechef.com/account",

  // ── Fitness & Wellness ──
  "planet fitness": "https://www.planetfitness.com/my-account/subscription",
  "crunch fitness": "https://members.crunch.com/",
  "crunch": "https://members.crunch.com/",
  "equinox": "https://www.equinox.com/account",
  "orangetheory": "https://www.orangetheory.com/en-us/member-portal",
  "strava": "https://www.strava.com/account",
  "alltrails": "https://www.alltrails.com/account",
  "headspace": "https://www.headspace.com/subscriptions",
  "fitbit": "https://www.fitbit.com/settings/subscription",
  "tonal": "https://www.tonal.com/account",
  "beachbody": "https://www.beachbodyondemand.com/account",
  "classpass": "https://classpass.com/account/membership",
  "ymca": "https://www.ymca.org/",
  "24 hour fitness": "https://www.24hourfitness.com/myaccount/",
  "lifetime fitness": "https://my.lifetime.life/account",

  // ── Productivity & Cloud Storage ──
  "adobe": "https://account.adobe.com/plans",
  "adobe creative cloud": "https://account.adobe.com/plans",
  "canva": "https://www.canva.com/settings/billing",
  "microsoft 365": "https://account.microsoft.com/services",
  "microsoft": "https://account.microsoft.com/services",
  "office 365": "https://account.microsoft.com/services",
  "google one": "https://one.google.com/settings",
  "google workspace": "https://workspace.google.com/dashboard",
  "google storage": "https://one.google.com/settings",
  "dropbox": "https://www.dropbox.com/account/plan",
  "notion": "https://www.notion.so/my-account",
  "evernote": "https://www.evernote.com/Settings.action",
  "slack": "https://slack.com/plans",
  "zoom": "https://us02web.zoom.us/account",
  "grammarly": "https://account.grammarly.com/subscription",
  "1password": "https://my.1password.com/settings/billing",
  "dashlane": "https://app.dashlane.com/settings/subscription",
  "figma": "https://www.figma.com/settings",
  "github copilot": "https://github.com/settings/copilot",
  "chatgpt": "https://chat.openai.com/settings/subscription",
  "openai": "https://platform.openai.com/settings/organization/billing",
  "claude": "https://claude.ai/settings",
  "midjourney": "https://www.midjourney.com/account",

  // ── VPN & Security ──
  "nordvpn": "https://my.nordaccount.com/dashboard/nordvpn/",
  "expressvpn": "https://www.expressvpn.com/subscriptions",
  "surfshark": "https://my.surfshark.com/subscription",
  "protonvpn": "https://account.protonvpn.com/dashboard",
  "proton": "https://account.proton.me/dashboard",
  "norton": "https://my.norton.com/extspa/subscriptions",
  "malwarebytes": "https://my.malwarebytes.com/account/subscriptions",

  // ── Gaming ──
  "xbox game pass": "https://account.microsoft.com/services",
  "xbox": "https://account.microsoft.com/services",
  "playstation plus": "https://store.playstation.com/en-us/subscriptions",
  "ps plus": "https://store.playstation.com/en-us/subscriptions",
  "playstation": "https://store.playstation.com/en-us/subscriptions",
  "nintendo switch online": "https://ec.nintendo.com/my/membership",
  "nintendo": "https://ec.nintendo.com/my/membership",
  "geforce now": "https://www.nvidia.com/en-us/account/gfn/",

  // ── News & Media ──
  "wsj": "https://customercenter.wsj.com/manage-subscriptions",
  "wall street journal": "https://customercenter.wsj.com/manage-subscriptions",
  "nytimes": "https://myaccount.nytimes.com/seg/subscription",
  "new york times": "https://myaccount.nytimes.com/seg/subscription",
  "medium": "https://medium.com/me/settings/membership",
  "linkedin": "https://www.linkedin.com/premium/cancel",
  "linkedin premium": "https://www.linkedin.com/premium/cancel",

  // ── Dating ──
  "bumble": "https://bumble.com/en/get-started",
  "hinge": "https://hingeapp.zendesk.com/hc/en-us/articles/360012065853",
  "match": "https://www.match.com/account",

  // ── Education ──
  "duolingo": "https://www.duolingo.com/settings/subscription",
  "masterclass": "https://www.masterclass.com/account/subscription",
  "coursera": "https://www.coursera.org/account-settings",
  "skillshare": "https://www.skillshare.com/settings/payments",
  "blinkist": "https://www.blinkist.com/en/settings/subscription",

  // ── Subscription Boxes ──
  "barkbox": "https://www.barkbox.com/account",
  "dollar shave club": "https://www.dollarshaveclub.com/your-account",
  "fabfitfun": "https://www.fabfitfun.com/account",
  "stitch fix": "https://www.stitchfix.com/settings/account",
  "ipsy": "https://www.ipsy.com/glambag/settings",

  // ── Insurance & Utilities ──
  "state farm": "https://www.statefarm.com/customer-care",

  // ── Communications ──
  "ring": "https://account.ring.com/account/subscription",
  "simplisafe": "https://webapp.simplisafe.com/new/#/account",

  // ── Recently Added Verified Links ──
  "apple care+": "https://apps.apple.com/account/subscriptions",
  "apple care": "https://apps.apple.com/account/subscriptions",
  "applecare+": "https://apps.apple.com/account/subscriptions",
  "applecare": "https://apps.apple.com/account/subscriptions",
  "hevy pro": "https://apps.apple.com/account/subscriptions",
  "hevy": "https://apps.apple.com/account/subscriptions",
  "google ai pro": "https://myaccount.google.com/payments-and-subscriptions",
  "google ai": "https://myaccount.google.com/payments-and-subscriptions",
  "gemini advanced": "https://myaccount.google.com/payments-and-subscriptions",
  "gemini": "https://myaccount.google.com/payments-and-subscriptions",
  "siriusxm": "https://care.siriusxm.com/",
  "sirius xm": "https://care.siriusxm.com/",
};

// Build a universal fallback for any merchant not in the list
function getCancelUrl(itemName) {
  const nameLower = (itemName || "").toLowerCase().trim();
  if (!nameLower) return null;

  // 1. Exact Name match
  if (CANCELLATION_LINKS[nameLower]) return CANCELLATION_LINKS[nameLower];

  // Helper for simple Levenshtein distance (fuzzy matching)
  const getDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j += 1) {
      for (let i = 1; i <= a.length; i += 1) {
        const ind = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + ind
        );
      }
    }
    return matrix[b.length][a.length];
  };

  const normalizedInput = nameLower.replace(/[^a-z0-9]/g, "");

  for (const key of Object.keys(CANCELLATION_LINKS)) {
    const normalizedKey = key.replace(/[^a-z0-9]/g, "");

    // 2. Normalized substring match (handles "Net flix" or "Netflix Premium" or "N.e.t.f.l.i.x")
    if (normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput)) {
      return CANCELLATION_LINKS[key];
    }

    // 3. Fuzzy match for typos (e.g. "Netlix" vs "Netflix")
    // Only fuzzy match if both strings are >= 4 chars to prevent short acronyms from false-positives
    if (normalizedInput.length >= 4 && normalizedKey.length >= 4) {
      // Allow 1 typo (insertion, deletion, substitution) for every 5 characters
      const allowedTypos = Math.floor(Math.max(normalizedInput.length, normalizedKey.length) / 5) || 1;
      if (getDistance(normalizedInput, normalizedKey) <= allowedTypos) {
        return CANCELLATION_LINKS[key];
      }
    }
  }

  // 4. No match found — return null to avoid cluttering the UI with generic search links
  return null;
}

export default memo(function RenewalsTab({ proEnabled }) {
  const { current } = useAudit();
  const portfolioContext = usePortfolio();
  const { navTo } = useNavigation();
  const isDemo = !!current?.isTest;

  // Demo mode: use local state so cancel/restore/delete actually work
  const [demoRenewals, setDemoRenewals] = useState(() => current?.demoPortfolio?.renewals || []);
  // Reset demo renewals if the demo data changes
  useEffect(() => {
    if (isDemo) setDemoRenewals(current?.demoPortfolio?.renewals || []);
  }, [isDemo, current?.demoPortfolio?.renewals]);

  const renewals = isDemo ? demoRenewals : portfolioContext.renewals;
  const setRenewals = isDemo ? setDemoRenewals : portfolioContext.setRenewals;
  const cards = isDemo ? current.demoPortfolio?.cards || [] : portfolioContext.cards;
  const { cardAnnualFees } = portfolioContext;
  const [editing, setEditing] = useState(null); // index within user renewals
  const [editVal, setEditVal] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [negotiateSheet, setNegotiateSheet] = useState(null); // { merchant, type, tactic, amount, name }
  const [addForm, setAddForm] = useState({
    name: "",
    amount: "",
    interval: 1,
    intervalUnit: "months",
    source: "",
    chargedTo: "",
    chargedToId: "",
    category: "subs",
    nextDue: "",
  });
  const [sortBy, setSortBy] = useState("type");
  const [editStep, setEditStep] = useState(0);

  const formInputStyle = {
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
    const now = new Date().toISOString().split("T")[0];
    let changed = false;
    const updated = renewals.map(r => {
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
  const allItems = useMemo(() => {
    const now = new Date().toISOString().split("T")[0];
    const items = [...(renewals || [])].map((r, idx) => ({
      ...r,
      originalIndex: idx,
      isExpired: r.intervalUnit === "one-time" && r.nextDue && r.nextDue < now && !r.isCancelled,
    }));
    (cardAnnualFees || []).forEach(af => {
      const exists = items.some(
        r =>
          (r.linkedCardId && af.linkedCardId && r.linkedCardId === af.linkedCardId) ||
          r.name === af.name ||
          r.linkedCardAF === af.cardName
      );
      if (!exists) items.push(af);
    });
    return items;
  }, [renewals, cardAnnualFees]);

  // Group by category
  const grouped = useMemo(() => {
    const cats = {};
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
      cats[catId].items.push(item);
    });

    // Sort items within each category: frequency (most frequent first) → next due (soonest first) → amount (highest first)
    const unitWeight = { weeks: 1, months: 2, years: 3 };
    const toMonths = (interval, unit) => {
      const i = interval || 1;
      if (unit === "days") return i / 30.44;
      if (unit === "weeks") return i / 4.33;
      if (unit === "years") return i * 12;
      if (unit === "one-time") return 999;
      return i;
    };
    Object.values(cats).forEach(cat => {
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
    return order.filter(id => cats[id]).map(id => cats[id]);
  }, [allItems, sortBy]);

  const monthlyTotal = useMemo(() => {
    let t = 0;
    allItems.forEach(i => {
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
    (item, renewalIndex) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      setEditing(renewalIndex);
      setEditStep(0);
      // If chargedTo is missing but source contains a card reference, try to pre-populate
      let chargedTo = item.chargedTo || "";
      let chargedToId = item.chargedToId || "";
      if (!chargedTo && item.source) {
        // Try to match source against known card names (e.g. "Ally→Delta Business Gold" → look for "Delta Business Gold")
        const allCardNames = (cards || []).map(c => c.name);
        const srcParts = (item.source || "").split("→");
        const potentialCard = srcParts[srcParts.length - 1].trim();
        // Check if any card name ends with the potential card reference
        const matched = allCardNames.find(
          cn => cn.endsWith(potentialCard) || potentialCard.endsWith(cn.split(" ").slice(1).join(" "))
        );
        if (matched) {
          chargedTo = matched;
          const matchCard = (cards || []).find(c => c.name === matched);
          if (matchCard) chargedToId = matchCard.id;
        }
      }
      setEditVal({
        name: item.name,
        amount: String(item.amount),
        interval: item.interval || 1,
        intervalUnit: item.intervalUnit || "months",
        source: item.source || "",
        chargedTo,
        chargedToId,
        nextDue: item.nextDue || "",
        category: item.category || "subs",
      });
    },
    [cards]
  );
  const saveEdit = useCallback(
    (renewalIndex, fallbackName) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      // If standard user flow, ensure label is consistent short name
      const label = editVal.chargedToId
        ? getShortCardLabel(cards || [], cards.find(c => c.id === editVal.chargedToId)) || editVal.chargedTo
        : editVal.chargedTo;
      const newName = (editVal.name || "").trim() || fallbackName;
      setRenewals(prev =>
        (prev || []).map((r, idx) =>
          idx === renewalIndex
            ? {
              ...r,
              name: newName,
              amount: parseFloat(editVal.amount) || 0,
              interval: editVal.interval,
              intervalUnit: editVal.intervalUnit,
              cadence: formatInterval(editVal.interval, editVal.intervalUnit),
              source: editVal.source,
              chargedTo: label,
              chargedToId: editVal.chargedToId,
              nextDue: editVal.nextDue,
              category: editVal.category || r.category,
            }
            : r
        )
      );
      setEditing(null);
    },
    [editVal, cards, setRenewals]
  );
  const removeItem = useCallback(
    (renewalIndex, itemName) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
      setRenewals(prev => (prev || []).filter((_, idx) => idx !== renewalIndex));
    },
    [setRenewals]
  );

  const toggleCancel = useCallback(
    (renewalIndex, itemName) => {
      if (renewalIndex == null || renewalIndex < 0) return;
      const current = (renewals || [])[renewalIndex];
      if (!current) return;
      if (!current.isCancelled) {
        // Cancelling — confirm with projected savings
        const amt = current.amount || 0;
        const unit = (current.intervalUnit || "monthly").toLowerCase();
        const interval = current.interval || 1;
        let annualSavings = 0;
        if (unit === "weekly" || unit === "week") annualSavings = (amt / interval) * 52;
        else if (unit === "monthly" || unit === "month") annualSavings = (amt / interval) * 12;
        else if (unit === "yearly" || unit === "year" || unit === "annual") annualSavings = amt / interval;
        else if (unit === "daily" || unit === "day") annualSavings = (amt / interval) * 365;
        else annualSavings = amt * 12; // default monthly
        const savingsLine = annualSavings > 0
          ? `\n\nYou'll save ~$${annualSavings.toFixed(0)}/year.`
          : "";
        if (
          !window.confirm(
            `Cancel "${itemName || current.name}"?\n\nThis will move it to Inactive & History. You can restore it later.${savingsLine}`
          )
        )
          return;
        setRenewals(prev =>
          (prev || []).map((r, idx) =>
            idx === renewalIndex ? { ...r, isCancelled: true, cancelledAt: new Date().toISOString().split("T")[0] } : r
          )
        );
      } else {
        // Restoring
        setRenewals(prev =>
          (prev || []).map((r, idx) =>
            idx === renewalIndex ? { ...r, isCancelled: false, cancelledAt: undefined } : r
          )
        );
      }
    },
    [renewals, setRenewals]
  );

  const addItem = () => {
    if (!addForm.name.trim() || !addForm.amount) return;
    // Resolve actual name if card was selected by ID
    const label = addForm.chargedToId
      ? getShortCardLabel(cards || [], cards.find(c => c.id === addForm.chargedToId)) || addForm.chargedTo
      : addForm.chargedTo;
    const newItem = {
      name: addForm.name.trim(),
      amount: parseFloat(addForm.amount) || 0,
      interval: parseInt(addForm.interval),
      intervalUnit: addForm.intervalUnit,
      cadence: formatInterval(parseInt(addForm.interval), addForm.intervalUnit),
      source: addForm.source,
      chargedTo: label,
      chargedToId: addForm.chargedToId,
      category: addForm.category,
      nextDue: addForm.nextDue || "",
    };
    setRenewals([...(renewals || []), newItem]);
    setAddForm({
      name: "",
      amount: "",
      interval: 1,
      intervalUnit: "months",
      source: "",
      chargedTo: "",
      chargedToId: "",
      category: "subs",
      nextDue: "",
    });
    setShowAdd(false);
  };

  const IntervalDropdown = ({ interval, unit, onChange }) => (
    <div style={{ display: "flex", gap: 6, flex: 1 }}>
      <select
        value={interval}
        onChange={e => onChange({ interval: parseInt(e.target.value), unit })}
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
        onChange={e => onChange({ interval, unit: e.target.value })}
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

  const CardSelector = ({ value, onChange }) => {
    const grouped = {};
    (cards || []).forEach(c => {
      (grouped[c.institution] = grouped[c.institution] || []).push(c);
    });
    const opts = [
      { value: "Checking", label: "Checking Account" },
      { value: "Savings", label: "Savings Account" },
      { value: "Cash", label: "Cash" },
      ...Object.entries(grouped).flatMap(([inst, instCards]) =>
        instCards.map(c => ({
          value: c.id || "",
          label: getShortCardLabel(cards || [], c),
          group: inst,
        }))
      ),
    ];
    return <SearchableSelect value={value || ""} onChange={onChange} placeholder="Payment method…" options={opts} />;
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

  const { detected, dismissSuggestion } = useSubscriptions(renewals, proEnabled);

  return (
    <>
    <div className="page-body stagger-container" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
      <div style={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column" }}>
        {/* existing header & monthly total */}
        <div
          style={{
            paddingTop: 16,
            paddingBottom: 16,
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
                onChange={e => setSortBy(e.target.value)}
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
                          setRenewals(prev => [...(prev || []), {
                            name: sub.name,
                            amount: sub.amount,
                            interval: 1,
                            intervalUnit: "months",
                            cadence: "1 month",
                            category: sub.category,
                            source: sub.source,
                            chargedTo: sub.chargedTo,
                            nextDue: sub.nextDue
                          }]);
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
                  />
                </div>
              </FormRow>
              <FormRow label="Payment Method">
                <div style={{ width: "100%", maxWidth: 160 }}>
                  <CardSelector
                    value={addForm.chargedToId || addForm.chargedTo}
                    onChange={v => {
                      const card = (cards || []).find(c => c.id === v);
                      setAddForm(p => ({
                        ...p,
                        chargedToId: card ? card.id : "",
                        chargedTo: card ? getShortCardLabel(cards || [], card) : v,
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
          grouped.map((cat, catIdx) => (
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

                  return (
                    <div
                      key={itemKey}
                      style={{
                        borderBottom: i === cat.items.length - 1 ? "none" : `1px solid ${T.border.subtle}`,
                        padding: "16px 20px",
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
                                    value={editVal.chargedToId || editVal.chargedTo}
                                    onChange={v => {
                                      const card = (cards || []).find(c => c.id === v);
                                      setEditVal(p => ({
                                        ...p,
                                        chargedToId: card ? card.id : "",
                                        chargedTo: card ? getShortCardLabel(cards || [], card) : v,
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
                          minHeight: 40,
                          padding: "16px 0",
                          marginBottom: 4
                        }}>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              paddingRight: 16,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                            }}
                          >
                            {/* Top Row: Title & Badges */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                              <span
                                style={{
                                  fontSize: 15,
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
                            <div style={{
                              display: "flex",
                              flexWrap: "wrap",
                              columnGap: 24,
                              rowGap: 8,
                              alignItems: "center"
                            }}>
                              {/* Cadence */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Mono size={14} color={T.text.dim}>
                                  {item.cadence || formatInterval(item.interval, item.intervalUnit)}
                                </Mono>
                              </div>

                              {/* Payment Method */}
                              {item.chargedTo && (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: "100%" }}>
                                  <div style={{ width: 1.5, height: 16, backgroundColor: T.text.dim, opacity: 0.6 }} />
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <CreditCard size={14} color={T.accent.primary} style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, color: T.text.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {item.chargedTo.replace(/^(American Express|Barclays|Capital One|Chase|Citi|Discover) /, "")}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Due Date */}
                              {item.nextDue && (
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  {(!item.chargedTo) && <div style={{ width: 1.5, height: 16, backgroundColor: T.text.dim, opacity: 0.6 }} />}
                                  <div style={{ width: 1.5, height: 16, backgroundColor: T.text.dim, opacity: 0.6 }} />
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <Calendar size={14} color={T.text.dim} style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                                      Due {item.nextDue}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Notes / Source */}
                              {item.source && (
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, width: "100%", marginTop: 2 }}>
                                  <AlignLeft size={14} color={T.text.dim} style={{ flexShrink: 0, marginTop: 2 }} />
                                  <span style={{ fontSize: 13, color: T.text.muted, fontStyle: "italic", lineHeight: 1.4 }}>
                                    {item.source}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons Row */}
                            {!item.isCardAF && !item.archivedAt && (cancelUrl || negotiableMerchant) && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
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
                                      gap: 6,
                                      padding: "6px 14px",
                                      borderRadius: 100, // Pill shape
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: T.status.red,
                                      textDecoration: "none",
                                      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.base})`,
                                      border: `1px solid ${T.status.red}30`,
                                      boxShadow: `0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
                                    }}
                                  >
                                    {cancelUrl.includes("google.com/search") ? "How to Cancel" : "Cancel"}
                                    <ExternalLink size={10} style={{ opacity: 0.8 }} />
                                  </a>
                                )}

                                {/* Email Cancel */}
                                {cancelUrl && !cancelUrl.includes("google.com/search") && (
                                  <a
                                    href={`mailto:support@${(item.name || "company").toLowerCase().replace(/[^a-z0-9]/g, "")}.com?subject=Subscription%20Cancellation%20Request&body=Hello,%0D%0A%0D%0AI%20would%20like%20to%20cancel%20my%20${encodeURIComponent(item.name || "subscription")}%20plan%20effective%20immediately.%20Please%20confirm%20when%20this%20has%20been%20processed.%0D%0A%0D%0AThank%20you.`}
                                    className="hover-btn"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: 6,
                                      padding: "6px 14px",
                                      borderRadius: 100,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: T.text.secondary,
                                      textDecoration: "none",
                                      background: `linear-gradient(180deg, ${T.bg.card}, ${T.bg.base})`,
                                      border: `1px solid ${T.border.default}`,
                                      boxShadow: `0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
                                    }}
                                  >
                                    ✉ Email
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
                                      gap: 6,
                                      padding: "6px 14px",
                                      borderRadius: 100,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: T.accent.primary,
                                      background: `linear-gradient(180deg, ${T.accent.primaryDim}, transparent)`,
                                      backgroundColor: T.bg.card,
                                      border: `1px solid ${T.accent.primary}40`,
                                      boxShadow: `0 2px 6px ${T.accent.primary}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Bot size={11} />
                                    Negotiate
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Column: Amount & Actions */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: T.text.primary, marginBottom: 12 }}>
                              ${(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>

                            {!item.isCardAF && isUserRenewal && editing !== renewalIndex && (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(item, renewalIndex); }}
                                  className="hover-btn"
                                  style={{
                                    width: 32, height: 32, borderRadius: T.radius.md,
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
                                    width: 32, height: 32, borderRadius: T.radius.md, border: "none",
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

      {/* ── NEGOTIATE SHEET ── */}
      {negotiateSheet && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { setNegotiateSheet(null); haptic.light(); }}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              animation: "fadeIn .2s ease",
            }}
          />
          {/* Sheet */}
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
            }}
          >
            <style>{`
              @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
              @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
            `}</style>

            {/* Handle bar */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border.default }} />
            </div>

            {/* Header */}
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

            {/* Scrollable tactic body */}
            <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
              {/* Tactic card */}
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

              {/* CTA buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Generate full AI script — opens AskAI with the negotiation context */}
                <button
                  onClick={() => {
                    if (shouldShowGating() && !proEnabled) {
                      haptic.selection();
                      setShowPaywall(true);
                      return;
                    }
                    haptic.success();
                    setNegotiateSheet(null);
                    navTo("chat", {
                      negotiateBill: {
                        merchant: negotiateSheet.merchant,
                        amount: negotiateSheet.amount,
                        tactic: negotiateSheet.tactic,
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
        </>
      )}
    </>
  );
});
