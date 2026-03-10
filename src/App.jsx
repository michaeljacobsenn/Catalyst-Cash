import { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import {
  History,
  Plus,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  CreditCard,
  Settings,
  Info,
  Home,
  Zap,
  Trash2,
  ClipboardPaste,
  LayoutDashboard,
  ReceiptText,
  Clock,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import { T, DEFAULT_CARD_PORTFOLIO, RENEWAL_CATEGORIES, APP_VERSION } from "./modules/constants.js";
import { DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID, getProvider, getModel } from "./modules/providers.js";
import {
  db,
  parseAudit,
  exportAllAudits,
  exportSelectedAudits,
  exportAuditCSV,
  advanceExpiredDate,
  cyrb53,
} from "./modules/utils.js";
import { ensureCardIds, getCardLabel } from "./modules/cards.js";
import { loadCardCatalog } from "./modules/issuerCards.js";
import { GlobalStyles, Card, ErrorBoundary, useGlobalHaptics, Badge, getTracking } from "./modules/ui.jsx";
import { StreamingView } from "./modules/components.jsx";
import { streamAudit, callAudit } from "./modules/api.js";
import { getSystemPrompt } from "./modules/prompts.js";
import { generateStrategy } from "./modules/engine.js";
import { POPULAR_STOCKS } from "./modules/marketData.js";
import { buildScrubber } from "./modules/scrubber.js";
import { extractCategoryByKeywords } from "./modules/merchantDatabase.js";
import { getOptimalCard } from "./modules/rewardsCatalog.js";
import { haptic } from "./modules/haptics.js";
import { installGlobalHandlers } from "./modules/errorReporter.js";
// Payday reminder scheduling is handled in SettingsContext.jsx
installGlobalHandlers();
import { ToastProvider, useToast } from "./modules/Toast.jsx";
import DashboardTab from "./modules/tabs/DashboardTab.jsx";
import InputForm from "./modules/tabs/InputForm.jsx";
import ResultsView from "./modules/tabs/ResultsView.jsx";
// Code-split: lazy-load tabs that aren't visible on initial render
const HistoryTab = lazy(() => import("./modules/tabs/HistoryTab.jsx"));
const AIChatTab = lazy(() => import("./modules/tabs/AIChatTab.jsx"));
const SettingsTab = lazy(() => import("./modules/tabs/SettingsTab.jsx"));
const CardPortfolioTab = lazy(() => import("./modules/tabs/CardPortfolioTab.jsx"));
const RenewalsTab = lazy(() => import("./modules/tabs/RenewalsTab.jsx"));
const TransactionFeed = lazy(() => import("./modules/tabs/TransactionFeed.jsx"));
const CardWizardTab = lazy(() => import("./modules/tabs/CardWizardTab.jsx"));
import GuideModal from "./modules/tabs/GuideModal.jsx";
import LockScreen from "./modules/LockScreen.jsx";
import SetupWizard from "./modules/tabs/SetupWizard.jsx";
import { SecurityProvider, useSecurity } from "./modules/contexts/SecurityContext.jsx";
import { SettingsProvider, useSettings } from "./modules/contexts/SettingsContext.jsx";
import { PortfolioProvider, usePortfolio } from "./modules/contexts/PortfolioContext.jsx";
import { NavigationProvider, useNavigation } from "./modules/contexts/NavigationContext.jsx";
import { AuditProvider, useAudit } from "./modules/contexts/AuditContext.jsx";
import { isPro, getGatingMode, syncRemoteGatingMode } from "./modules/subscription.js";
import { initRevenueCat } from "./modules/revenuecat.js";
import { syncOTAData } from "./modules/ota.js";
import { isSecuritySensitiveKey } from "./modules/securityKeys.js";
import { evaluateBadges, unlockBadge, BADGE_DEFINITIONS } from "./modules/badges.js";
import "./modules/tabs/DashboardTab.css"; // Global animations, skeleton loaders, utility classes
import { deleteSecureItem } from "./modules/secureStore.js";

function flattenSeedRenewals() {
  const items = [];
  RENEWAL_CATEGORIES.forEach(cat => {
    cat.items.forEach(item => items.push({ ...item, category: cat.id }));
  });
  return items;
}

function useOnline() {
  const [o, setO] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setO(true),
      off = () => setO(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return o;
}

// Suspense fallback for lazy-loaded tabs — iOS-style skeleton loader
const TabFallback = () => (
  <div className="skeleton-loader" style={{ padding: "20px 16px" }}>
    <div className="skeleton-block" style={{ height: 48, borderRadius: 14 }} />
    <div className="skeleton-block" style={{ height: 120, borderRadius: 16 }} />
    <div style={{ display: "flex", gap: 10 }}>
      <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
      <div className="skeleton-block" style={{ height: 80, flex: 1, borderRadius: 14 }} />
    </div>
    <div className="skeleton-block" style={{ height: 64, borderRadius: 14 }} />
  </div>
);

// ═══════════════════════════════════════════════════════════════
// APP ROOT — wraps with ToastProvider
// ═══════════════════════════════════════════════════════════════
export default function AppRoot() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <SecurityProvider>
          <PortfolioProvider>
            <NavigationProvider>
              <AuditProvider>
                <CatalystCash />
              </AuditProvider>
            </NavigationProvider>
          </PortfolioProvider>
        </SecurityProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}

function CatalystCash() {
  const toast = useToast();
  useEffect(() => {
    window.toast = toast;
  }, [toast]);
  const online = useOnline();
  useGlobalHaptics(); // Auto-haptic on every button tap

  // Sync remote gating config on boot (anti-downgrade protection) and start OTA Data routines
  useEffect(() => {
    syncRemoteGatingMode();
    syncOTAData();
  }, []);

  const {
    requireAuth,
    setRequireAuth,
    appPasscode,
    setAppPasscode,
    useFaceId,
    setUseFaceId,
    isLocked,
    setIsLocked,
    privacyMode,
    setPrivacyMode,
    lockTimeout,
    setLockTimeout,
    appleLinkedId,
    setAppleLinkedId,
    isSecurityReady,
  } = useSecurity();
  const {
    apiKey,
    setApiKey,
    aiProvider,
    setAiProvider,
    aiModel,
    setAiModel,
    persona,
    setPersona,
    personalRules,
    setPersonalRules,
    autoBackupInterval,
    setAutoBackupInterval,
    notifPermission,
    aiConsent,
    setAiConsent,
    showAiConsent,
    setShowAiConsent,
    financialConfig,
    setFinancialConfig,
    isSettingsReady,
  } = useSettings();
  const {
    cards,
    setCards,
    bankAccounts,
    setBankAccounts,
    renewals,
    setRenewals,
    cardCatalog,
    badges,
    cardAnnualFees,
    isPortfolioReady,
  } = usePortfolio();
  const {
    current,
    setCurrent,
    history,
    setHistory,
    moveChecks,
    setMoveChecks,
    loading,
    error,
    setError,
    useStreaming,
    setUseStreaming,
    streamText,
    elapsed,
    viewing,
    setViewing,
    trendContext,
    instructionHash,
    setInstructionHash,
    handleSubmit,
    handleCancelAudit,
    clearAll,
    deleteHistoryItem,
    isAuditReady,
    handleManualImport,
    isTest,
  } = useAudit();
  const {
    tab,
    setTab,
    navTo,
    syncTab,
    swipeToTab,
    swipeAnimClass,
    resultsBackTarget,
    setResultsBackTarget,
    setupReturnTab,
    setSetupReturnTab,
    onboardingComplete,
    setOnboardingComplete,
    showGuide,
    setShowGuide,
    inputMounted,
    lastCenterTab,
    inputBackTarget,
    SWIPE_TAB_ORDER,
  } = useNavigation();

  const scrollRef = useRef(null);
  const bottomNavRef = useRef(null);
  const topBarRef = useRef(null);
  const [showTransactionFeed, setShowTransactionFeed] = useState(false);
  const swipeStart = useRef(null);
  const longPressTimer = useRef(null);
  const touchStartTime = useRef(0);
  const [chatInitialPrompt, setChatInitialPrompt] = useState(null);

  // ── iOS-native interactive swipe-back for overlay panes ──
  const useSwipeBack = (onDismiss) => {
    const paneRef = useRef(null);
    const touchRef = useRef(null);
    const isDragging = useRef(false);

    const onTouchStart = useCallback(e => {
      const touch = e.touches[0];
      // Only start from the left 40px edge zone
      if (touch.clientX > 40) return;
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now() };
      isDragging.current = false;
    }, []);

    const onTouchMove = useCallback(e => {
      if (!touchRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const dy = Math.abs(touch.clientY - touchRef.current.startY);

      // Only engage if horizontal movement > vertical (prevents hijacking scroll)
      if (!isDragging.current) {
        if (dx < 10) return; // Not enough movement yet
        if (dy > dx * 0.8) { touchRef.current = null; return; } // Too vertical — abort
        isDragging.current = true;
        if (paneRef.current) paneRef.current.classList.add("swipe-back-pane");
      }

      if (isDragging.current && paneRef.current && dx > 0) {
        const progress = Math.min(dx / window.innerWidth, 1);
        paneRef.current.style.transform = `translateX(${dx}px)`;
        paneRef.current.style.opacity = String(1 - progress * 0.3);
      }
    }, []);

    const onTouchEnd = useCallback(e => {
      if (!touchRef.current || !isDragging.current) {
        touchRef.current = null;
        isDragging.current = false;
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchRef.current.startX;
      const elapsed = Date.now() - touchRef.current.startTime;
      const velocity = dx / Math.max(elapsed, 1);
      const pane = paneRef.current;

      touchRef.current = null;
      isDragging.current = false;

      // Commit if swiped > 35% of screen width OR velocity is high enough
      if (dx > window.innerWidth * 0.35 || velocity > 0.5) {
        if (pane) {
          pane.classList.remove("swipe-back-pane");
          pane.classList.add("slide-pane-dismiss");
          pane.style.transform = "";
          pane.style.opacity = "";
        }
        haptic.light();
        setTimeout(() => onDismiss(), 280);
      } else {
        // Snap back
        if (pane) {
          pane.classList.remove("swipe-back-pane");
          pane.style.transition = "transform .3s cubic-bezier(.16,1,.3,1), opacity .3s ease";
          pane.style.transform = "translateX(0)";
          pane.style.opacity = "1";
          setTimeout(() => {
            if (pane) { pane.style.transition = ""; }
          }, 300);
        }
      }
    }, [onDismiss]);

    return { paneRef, onTouchStart, onTouchMove, onTouchEnd };
  };

  // ── iOS-native interactive swipe-down for modal panes ──
  const useSwipeDown = (onDismiss) => {
    const paneRef = useRef(null);
    const touchRef = useRef(null);
    const isDragging = useRef(false);

    const onTouchStart = useCallback(e => {
      // Don't start swipe-down if the user is scrolling the content
      // We check if the scroll area is already scrolled down
      const scrollBody = document.querySelector('.modal-pane .page-body, .modal-pane iframe');
      if (scrollBody && scrollBody.scrollTop > 5) return;

      const touch = e.touches[0];
      touchRef.current = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now() };
      isDragging.current = false;
    }, []);

    const onTouchMove = useCallback(e => {
      if (!touchRef.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchRef.current.startX);
      const dy = touch.clientY - touchRef.current.startY; // positive = downward

      // Only engage if vertical movement > horizontal, and moving DOWN
      if (!isDragging.current) {
        if (dy < 10) return; // Not enough downward movement
        if (dx > dy * 0.8) { touchRef.current = null; return; } // Too horizontal
        isDragging.current = true;
        if (paneRef.current) paneRef.current.classList.add("swipe-down-pane");
      }

      if (isDragging.current && paneRef.current && dy > 0) {
        const progress = Math.min(dy / window.innerHeight, 1);
        paneRef.current.style.transform = `translateY(${dy}px)`;
        paneRef.current.style.opacity = String(1 - progress * 0.3);
      }
    }, []);

    const onTouchEnd = useCallback(e => {
      if (!touchRef.current || !isDragging.current) {
        touchRef.current = null;
        isDragging.current = false;
        return;
      }

      const touch = e.changedTouches[0];
      const dy = touch.clientY - touchRef.current.startY;
      const elapsed = Date.now() - touchRef.current.startTime;
      const velocity = dy / Math.max(elapsed, 1);
      const pane = paneRef.current;

      touchRef.current = null;
      isDragging.current = false;

      // Commit if swiped > 20% of screen height OR velocity is high enough
      if (dy > window.innerHeight * 0.20 || velocity > 0.4) {
        if (pane) {
          pane.classList.remove("swipe-down-pane");
          pane.classList.add("modal-pane-dismiss");
          pane.style.transform = "";
          pane.style.opacity = "";
        }
        haptic.light();
        setTimeout(() => onDismiss(), 350);
      } else {
        // Snap back
        if (pane) {
          pane.classList.remove("swipe-down-pane");
          pane.style.transition = "transform .3s cubic-bezier(.16,1,.3,1), opacity .3s ease";
          pane.style.transform = "translateY(0)";
          pane.style.opacity = "1";
          setTimeout(() => {
            if (pane) { pane.style.transition = ""; }
          }, 300);
        }
      }
    }, [onDismiss]);

    return { paneRef, onTouchStart, onTouchMove, onTouchEnd };
  };

  // Create swipe-back instances for overlay panes
  const overlaySwipeResults = useSwipeBack(useCallback(() => {
    const target = resultsBackTarget === "history" ? "history" : "dashboard";
    setResultsBackTarget(null);
    navTo(target);
  }, [resultsBackTarget, navTo]));

  const overlaySwipeHistory = useSwipeBack(useCallback(() => {
    navTo(lastCenterTab.current);
  }, [navTo, lastCenterTab]));

  const overlaySwipeChat = useSwipeBack(useCallback(() => {
    navTo(lastCenterTab.current);
  }, [navTo, lastCenterTab]));

  const overlaySwipeGuide = useSwipeDown(useCallback(() => {
    setShowGuide(false);
  }, [setShowGuide]));

  // ── Shared swipe gesture handler (used by main scroll, input pane, chat pane) ──
  const ready = isSecurityReady && isSettingsReady && isPortfolioReady && isAuditReady;

  // Pro subscription state — resolved async on mount
  const [proEnabled, setProEnabled] = useState(true);
  useEffect(() => {
    initRevenueCat().then(() => {
      const mode = getGatingMode();
      // "off" = no gating at all, "soft" = show Pro UI but don't block features
      if (mode === "off" || mode === "soft") {
        setProEnabled(true);
        return;
      }
      isPro()
        .then(setProEnabled)
        .catch(() => setProEnabled(false));
    });
  }, []);

  const [showQuickMenu, setShowQuickMenu] = useState(false);

  // ── GEO-FENCING SIMULATOR ──
  const [simulatedNotification, setSimulatedNotification] = useState(null);

  useEffect(() => {
    const handleSimulate = (e) => {
      const store = e.detail?.store || "Store";
      const categoryStr = extractCategoryByKeywords(store) || "other";
      // Need valuations to map strings correctly if custom ones exist, but getOptimalCard uses defaults gracefully
      const optimal = getOptimalCard(cards || [], categoryStr, financialConfig?.valuations || {});

      let recText = `Open Catalyst to see your best card.`;
      if (optimal && optimal.yield) {
         recText = `Use your ${optimal.cardName} here for ${parseFloat((optimal.yield * 100).toFixed(1))}% back!`;
      }

      setSimulatedNotification({
        title: store + " Nearby",
        body: recText,
        store
      });
      // Auto-dismiss
      setTimeout(() => setSimulatedNotification(null), 6000);
    };
    window.addEventListener("simulate-geo-fence", handleSimulate);
    return () => window.removeEventListener("simulate-geo-fence", handleSimulate);
  }, [cards, financialConfig]);

  // --- NATIVE SCROLL SNAP OBSERVER ---
  const snapContainerRef = useRef(null);
  const initialScrollLock = useRef(true);

  useEffect(() => {
    const container = snapContainerRef.current;
    if (!container) return;

    let isProgrammaticScroll = false;
    let programmaticDebounce = null;

    // Listen for manual navTo programmatic scrolls
    const onScrollToTab = (e) => {
      const targetTab = e.detail;
      const idx = SWIPE_TAB_ORDER.indexOf(targetTab);
      if (idx !== -1) {
        isProgrammaticScroll = true;
        const width = container.clientWidth;
        container.scrollTo({ left: idx * width, behavior: 'smooth' });

        // Backup safeguard in case `scroll` events don't fire immediately
        if (programmaticDebounce) clearTimeout(programmaticDebounce);
        programmaticDebounce = setTimeout(() => { isProgrammaticScroll = false; }, 800);
      }
    };
    window.addEventListener("app-scroll-to-tab", onScrollToTab);

    // Watch for physical swipe scrolling using raw math
    let scrollDebounce = null;
    const onScroll = () => {
      if (initialScrollLock.current) return;
      
      // If programmatically scrolling, extend the lock until scrolling stops
      if (isProgrammaticScroll) {
        if (programmaticDebounce) clearTimeout(programmaticDebounce);
        programmaticDebounce = setTimeout(() => {
          isProgrammaticScroll = false;
        }, 150);
        return;
      }

      if (scrollDebounce) clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        const width = container.clientWidth;
        if (width <= 0) return; // Prevent division by zero and incorrect 0-index on boot

        // Calculate which pane is most visible
        const index = Math.round(container.scrollLeft / width);
        const snappedTab = SWIPE_TAB_ORDER[index];
        if (snappedTab) syncTab(snappedTab);
      }, 10); // Ultra-low debounce to instantly update tab active state
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    // On mount, snap to the initial tab - wait for layout
    const enforceInitialScroll = () => {
      const initialIdx = SWIPE_TAB_ORDER.indexOf(tab);
      if (initialIdx !== -1) {
        const width = container.clientWidth || window.innerWidth;
        const target = initialIdx * Math.max(width, 0);
        if (Math.abs(container.scrollLeft - target) > 5) {
          isProgrammaticScroll = true;
          container.scrollTo({ left: target, behavior: 'instant' });
          if (programmaticDebounce) clearTimeout(programmaticDebounce);
          programmaticDebounce = setTimeout(() => { isProgrammaticScroll = false; }, 200);
        }
      }
    };

    // Enforcement loop: Chrome's native scroll restoration runs async after paint.
    // We forcefully override it for the first 600ms to guarantee React's tab state is honored.
    const enforceInterval = setInterval(enforceInitialScroll, 50);

    const lockTimer = setTimeout(() => { 
      clearInterval(enforceInterval);
      initialScrollLock.current = false; 
    }, 600);

    return () => {
      clearInterval(enforceInterval);
      clearTimeout(lockTimer);
      window.removeEventListener("app-scroll-to-tab", onScrollToTab);
      container.removeEventListener("scroll", onScroll);
      if (scrollDebounce) clearTimeout(scrollDebounce);
      if (programmaticDebounce) clearTimeout(programmaticDebounce);
    };
  }, [ready, onboardingComplete]);

  // ── Lock swipe-nav when keyboard is open (input/textarea focused) ──
  useEffect(() => {
    const container = snapContainerRef.current;
    if (!container) return;

    const isEditable = (el) =>
      el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable;

    const onFocusIn = (e) => {
      if (isEditable(e.target)) {
        container.style.scrollSnapType = "none";
        container.style.overflowX = "hidden";
      }
    };
    const onFocusOut = (e) => {
      if (isEditable(e.target)) {
        // Small delay to avoid snap-back during field-to-field focus changes
        setTimeout(() => {
          if (!isEditable(document.activeElement)) {
            container.style.scrollSnapType = "";
            container.style.overflowX = "";
          }
        }, 100);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);


  // ═══════════════════════════════════════════════════════════════

  // Payday reminder scheduling is handled in SettingsContext.jsx — no duplicate here

  // ═══════════════════════════════════════════════════════════════
  // iCLOUD AUTO-BACKUP — Syncs all user data to iCloud ubiquity
  // container via native ICloudSyncPlugin. Survives app deletion
  // and restores on new devices with the same Apple ID.
  // ═══════════════════════════════════════════════════════════════
  const iCloudSyncTimer = useRef(null);
  useEffect(() => {
    if (!ready || !appleLinkedId) return;
    if (autoBackupInterval === "off") return;

    if (iCloudSyncTimer.current) clearTimeout(iCloudSyncTimer.current);

    iCloudSyncTimer.current = setTimeout(async () => {
      try {
        // Enforce backup schedule
        const lastBackupStr = await db.get("last-backup-ts");
        const lastBackup = lastBackupStr ? Number(lastBackupStr) : 0;
        const now = Date.now();
        const hrs24 = 24 * 60 * 60 * 1000;
        let requiredDeltaMs = 0;

        if (autoBackupInterval === "daily") requiredDeltaMs = hrs24;
        else if (autoBackupInterval === "weekly") requiredDeltaMs = hrs24 * 7;
        else if (autoBackupInterval === "monthly") requiredDeltaMs = hrs24 * 30;

        if (now - lastBackup < requiredDeltaMs) {
          return; // Throttled — schedule not yet met
        }

        const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };
        const keys = await db.keys();
        for (const key of keys) {
          if (isSecuritySensitiveKey(key)) continue; // Never sync security credentials
          const val = await db.get(key);
          if (val !== null) backup.data[key] = val;
        }
        if (!("personal-rules" in backup.data)) {
          backup.data["personal-rules"] = personalRules ?? "";
        }

        // Include sanitized Plaid metadata (no access tokens) for reconnect deduplication
        const plaidConns = await db.get("plaid-connections");
        if (Array.isArray(plaidConns) && plaidConns.length > 0) {
          const { sanitizePlaidForBackup } = await import("./modules/securityKeys.js");
          backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
        }

        const success = await uploadToICloud(backup, appPasscode || null);
        if (success) {
          await db.set("last-backup-ts", now);
          // Settings UI polls this key on mount or relies on local state update which is handled there.
          // We just need it perfectly accurately persisted to the DB on success.
          console.log("[iCloud] Auto-backup schedule completed successfully.");
        }
      } catch (e) {
        console.error("iCloud auto-sync error:", e);
      }
    }, 15000); // 15 second debounce — avoid writing on every keystroke

    return () => clearTimeout(iCloudSyncTimer.current);
  }, [ready, history, renewals, cards, financialConfig, personalRules, appleLinkedId, autoBackupInterval]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  useEffect(() => {
    if (!bottomNavRef.current) return;
    const update = () => {
      const h = bottomNavRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--bottom-nav-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bottomNavRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!topBarRef.current) return;
    const update = () => {
      const h = topBarRef.current.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--top-bar-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CLIPBOARD AUTO-DETECT — check clipboard on app resume
  // ═══════════════════════════════════════════════════════════════
  const lastClipRef = useRef("");
  useEffect(() => {
    const checkClipboard = async () => {
      if (document.hidden) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text || text === lastClipRef.current || text.length < 50) return;
        // Heuristic: looks like an audit response if it has markdown headers + dollar amounts
        const hasHeaders = /##\s*(ALERT|DASHBOARD|MOVES|RADAR|NEXT ACTION)/i.test(text);
        const hasDollars = /\$[\d,]+\.\d{2}/.test(text);
        const hasStatus = /\b(GREEN|YELLOW|RED)\b/.test(text);
        if (hasHeaders && hasDollars) {
          lastClipRef.current = text;
          toast.clipboard("Audit detected in clipboard", {
            duration: 8000,
            action: {
              label: "Import",
              fn: () => {
                handleManualImport(text);
                haptic.success();
              },
            },
          });
        }
      } catch { } // clipboard permission denied — silent fail
    };
    const onVis = () => {
      if (!document.hidden) setTimeout(checkClipboard, 500);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [history]);

  const toggleMove = async i => {
    haptic.light();
    if (viewing) {
      const updatedChecks = { ...(viewing.moveChecks || {}), [i]: !(viewing.moveChecks || {})[i] };
      const updatedViewing = { ...viewing, moveChecks: updatedChecks };
      setViewing(updatedViewing);
      const nh = history.map(a => (a.ts === viewing.ts ? updatedViewing : a));
      setHistory(nh);
      await db.set("audit-history", nh);
    } else {
      const n = { ...moveChecks, [i]: !moveChecks[i] };
      setMoveChecks(n);
      db.set("move-states", n);
      if (current) {
        const updatedCurrent = { ...current, moveChecks: n };
        setCurrent(updatedCurrent);
        db.set("current-audit", updatedCurrent);
        const nh = history.map(a => (a.ts === current.ts ? updatedCurrent : a));
        setHistory(nh);
        db.set("audit-history", nh);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // GUIDED FIRST AUDIT — pre-loaded sample data so users see the full value prop
  // Upgraded: lights up ALL 15+ dashboard sections with rich synthetic data
  // ═══════════════════════════════════════════════════════════════
  const handleDemoAudit = async () => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayMs = 86400000;

    // ── 1. ENRICHED DEMO JSON ──────────────────────────────────
    const demoJSON = {
      headerCard: {
        status: "GREEN",
        details: ["Demo audit with sample data", "Your real audit will use your actual finances"],
      },
      healthScore: {
        score: 88,
        grade: "A-",
        trend: "up",
        summary:
          "Excellent financial momentum. Strong savings buffers and aggressive debt paydown are compounding your wealth rapidly.",
        narrative:
          "Your checking is well above floor, vault is fully funded at 6-month coverage, and debt paydown pace puts you on track for freedom by October. The only drag is Chase Sapphire utilization at 24.6% — one more aggressive payment drops you into the optimal range and could boost your credit score 15–25 points.",
      },
      alertsCard: [
        "✅ Car insurance completely covered by Vault",
        "💰 Roth IRA maxed out for the year",
        "⚠️ Chase Sapphire utilization at 24.6% — aim for under 10%",
        "📈 Net worth up $2,340 this week — 7-week growth streak",
        "🎯 $600 away from $25K in savings",
      ],
      dashboardCard: [
        { category: "Checking", amount: "$8,450.00", status: "Above floor" },
        { category: "Vault", amount: "$22,200.00", status: "Fully funded" },
        { category: "Investments", amount: "$45,000.00", status: "Growing" },
        { category: "Other Assets", amount: "$101,000.00", status: "Home Equity" },
        { category: "Pending", amount: "$305.49", status: "3 upcoming" },
        { category: "Debts", amount: "$3,690.00", status: "1 card carrying balance" },
        { category: "Available", amount: "$6,144.51", status: "After obligations" },
      ],
      netWorth: 172960.0,
      netWorthDelta: "+$2,340 vs last week",
      weeklyMoves: [
        "💳 Pay Chase Sapphire $500 — aggressive principal payment to crush 24.99% APR debt",
        "📈 Transfer $1,000 to Vanguard Brokerage — dollar-cost averaging into VTSAX",
        "🏦 Move $400 to Ally Vault — build toward $25K savings milestone",
        "📊 Rebalance crypto allocation — trim BTC gains into ETH position",
        "🎯 Review Q1 sinking fund progress — vacation fund needs $233/mo to hit target",
      ],
      radar: [
        { item: "Netflix", amount: "$15.49", date: new Date(Date.now() + 3 * dayMs).toISOString().split("T")[0] },
        {
          item: "Electric Bill",
          amount: "$145.00",
          date: new Date(Date.now() + 5 * dayMs).toISOString().split("T")[0],
        },
        { item: "Spotify", amount: "$10.99", date: new Date(Date.now() + 8 * dayMs).toISOString().split("T")[0] },
        {
          item: "Car Insurance",
          amount: "$145.00",
          date: new Date(Date.now() + 14 * dayMs).toISOString().split("T")[0],
        },
        {
          item: "Property Tax",
          amount: "$1,100.00",
          date: new Date(Date.now() + 18 * dayMs).toISOString().split("T")[0],
        },
      ],
      longRangeRadar: [
        { item: "Home Maintenance Fund", amount: "$5,000.00", date: "2026-06-01" },
        { item: "Annual Car Registration", amount: "$285.00", date: "2026-07-15" },
        { item: "Family Vacation", amount: "$3,500.00", date: "2026-08-15" },
      ],
      milestones: [
        "Emergency fund fully stocked at 6 months",
        "Net Worth crossed $150K milestone last month",
        "Roth IRA maxed out for 2026",
        "Checking above floor for 8 consecutive weeks",
      ],
      investments: { balance: "$45,000.00", asOf: todayStr, gateStatus: "Open — accelerating contributions" },
      nextAction:
        "Execute the $500 Chase Sapphire payment to crush high-interest debt, then funnel your excess $1,000 into Vanguard to maximize your wealth snowball. After that, move $400 to Ally to close the gap on your $25K savings milestone — you're only $600 away.",
      spendingAnalysis: {
        totalSpent: "$847.23",
        dailyAverage: "$121.03",
        vsAllowance: "UNDER by $152.77",
        topCategories: [
          { category: "Groceries", amount: "$312.50", pctOfTotal: "37%" },
          { category: "Dining", amount: "$187.40", pctOfTotal: "22%" },
          { category: "Gas", amount: "$98.33", pctOfTotal: "12%" },
          { category: "Shopping", amount: "$156.00", pctOfTotal: "18%" },
          { category: "Entertainment", amount: "$93.00", pctOfTotal: "11%" },
        ],
        alerts: ["✅ Under weekly allowance — surplus available for debt acceleration"],
        debtImpact: "At current spending, debt-free by Oct 2026. Cutting $50/week accelerates by 3 weeks.",
      },
      paceData: [
        { name: "Family Vacation", saved: 2100, target: 3500 },
        { name: "Emergency Fund", saved: 14400, target: 15000 },
        { name: "New Laptop", saved: 680, target: 1200 },
        { name: "Holiday Gifts", saved: 350, target: 800 },
      ],
    };
    const raw = JSON.stringify(demoJSON);
    const parsed = parseAudit(raw);
    if (!parsed) {
      toast.error("Demo parsing failed");
      return;
    }

    // ── 2. DEMO PORTFOLIO (cards, bank accounts, renewals) ─────
    const demoCards = [
      {
        id: "demo-card-1",
        institution: "Chase",
        name: "Chase Sapphire Preferred",
        nickname: "Sapphire",
        mask: "4321",
        balance: 3690,
        limit: 15000,
        apr: 24.99,
        lastPaymentDate: today.toISOString(),
        network: "visa",
        monthlyBill: 145,
      },
      {
        id: "demo-card-2",
        institution: "American Express",
        name: "American Express Gold",
        mask: "9876",
        balance: 0,
        limit: 25000,
        apr: 0,
        lastPaymentDate: today.toISOString(),
        network: "amex",
      },
      {
        id: "demo-card-3",
        institution: "Discover",
        name: "Discover it Cash Back",
        mask: "5555",
        balance: 0,
        limit: 8000,
        apr: 0,
        lastPaymentDate: today.toISOString(),
        network: "discover",
      },
    ];
    const demoBankAccounts = [
      {
        id: "demo-chk-1",
        bank: "Chase",
        name: "Chase Total Checking",
        accountType: "checking",
        mask: "7890",
        balance: 8450,
        type: "depository",
        subtype: "checking",
        date: today.toISOString(),
      },
      {
        id: "demo-sav-1",
        bank: "Ally",
        name: "Ally High Yield Savings",
        accountType: "savings",
        mask: "1234",
        balance: 22200,
        type: "depository",
        subtype: "savings",
        date: today.toISOString(),
      },
    ];
    const demoRenewals = [
      {
        id: "demo-ren-1",
        name: "Netflix",
        amount: 15.49,
        interval: 1,
        intervalUnit: "months",
        nextDue: new Date(Date.now() + 3 * dayMs).toISOString().split("T")[0],
        category: "subs",
      },
      {
        id: "demo-ren-2",
        name: "Spotify",
        amount: 10.99,
        interval: 1,
        intervalUnit: "months",
        nextDue: new Date(Date.now() + 8 * dayMs).toISOString().split("T")[0],
        category: "subs",
      },
      {
        id: "demo-ren-3",
        name: "Car Insurance",
        amount: 145.0,
        interval: 1,
        intervalUnit: "months",
        nextDue: new Date(Date.now() + 14 * dayMs).toISOString().split("T")[0],
        category: "insurance",
      },
      {
        id: "demo-ren-4",
        name: "Electric Bill",
        amount: 145.0,
        interval: 1,
        intervalUnit: "months",
        nextDue: new Date(Date.now() + 5 * dayMs).toISOString().split("T")[0],
        category: "utilities",
      },
      {
        id: "demo-ren-5",
        name: "Internet",
        amount: 79.99,
        interval: 1,
        intervalUnit: "months",
        nextDue: new Date(Date.now() + 10 * dayMs).toISOString().split("T")[0],
        category: "utilities",
      },
      {
        id: "demo-ren-6",
        name: "Gym Membership",
        amount: 59.99,
        interval: 1,
        intervalUnit: "months",
        nextDue: new Date(Date.now() + 20 * dayMs).toISOString().split("T")[0],
        category: "subs",
      },
      {
        id: "demo-ren-7",
        name: "Annual Car Registration",
        amount: 285.0,
        interval: 1,
        intervalUnit: "years",
        nextDue: "2026-07-15",
        category: "insurance",
      },
    ];

    const demoPortfolio = { bankAccounts: demoBankAccounts, cards: demoCards, renewals: demoRenewals };

    // ── 3. SYNTHETIC HISTORY (6 weeks of "past audits") ────────
    // These use isDemoHistory: true (NOT isTest) so useDashboardData treats
    // them as real audits for charts, alerts, and freedom stats computation.
    const syntheticWeeks = [
      { weeksAgo: 6, checking: "6200", ally: "19500", debtBal: "5200", nw: 158400, score: 72, grade: "C+", spent: 820 },
      { weeksAgo: 5, checking: "6800", ally: "20100", debtBal: "4850", nw: 161050, score: 75, grade: "B-", spent: 680 },
      { weeksAgo: 4, checking: "7100", ally: "20800", debtBal: "4500", nw: 164200, score: 78, grade: "B", spent: 750 },
      { weeksAgo: 3, checking: "7500", ally: "21300", debtBal: "4200", nw: 167100, score: 81, grade: "B+", spent: 710 },
      { weeksAgo: 2, checking: "7900", ally: "21800", debtBal: "3950", nw: 169850, score: 84, grade: "B+", spent: 690 },
      { weeksAgo: 1, checking: "8200", ally: "22000", debtBal: "3800", nw: 170620, score: 86, grade: "A-", spent: 720 },
    ];
    const syntheticHistory = syntheticWeeks.map(w => {
      const d = new Date(Date.now() - w.weeksAgo * 7 * dayMs);
      const dateStr = d.toISOString().split("T")[0];
      const hJSON = {
        headerCard: { status: w.score >= 80 ? "GREEN" : "YELLOW" },
        healthScore: { score: w.score, grade: w.grade, trend: "up", summary: "Progressing steadily." },
        dashboardCard: [
          {
            category: "Checking",
            amount: `$${Number(w.checking).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
            status: "Active",
          },
          {
            category: "Vault",
            amount: `$${Number(w.ally).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
            status: "Growing",
          },
          { category: "Investments", amount: "$42,000.00", status: "Steady" },
          { category: "Other Assets", amount: "$101,000.00", status: "Home Equity" },
          {
            category: "Debts",
            amount: `$${Number(w.debtBal).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
            status: "Paying down",
          },
        ],
        netWorth: w.nw,
        weeklyMoves: ["Pay debt", "Save more"],
        nextAction: "Keep paying down debt.",
        alertsCard: [],
        radar: [],
        longRangeRadar: [],
        milestones: [],
        investments: { balance: "$42,000.00", asOf: dateStr, gateStatus: "Open" },
      };
      const hRaw = JSON.stringify(hJSON);
      const hParsed = parseAudit(hRaw);
      return {
        ts: d.toISOString(),
        date: dateStr,
        raw: hRaw,
        parsed: hParsed,
        isDemoHistory: true, // NOT isTest — so useDashboardData includes it
        moveChecks: {},
        form: {
          date: dateStr,
          checking: w.checking,
          ally: w.ally,
          budgetActuals: {
            groceries: String(Math.round(w.spent * 0.35)),
            dining: String(Math.round(w.spent * 0.2)),
            transport: String(Math.round(w.spent * 0.15)),
            entertainment: String(Math.round(w.spent * 0.15)),
            shopping: String(Math.round(w.spent * 0.15)),
          },
          debts: [
            { name: "Chase Sapphire", balance: w.debtBal, limit: "15000", apr: "24.99", minPayment: "45", nextDue: "" },
          ],
        },
      };
    });

    // ── 4. CURRENT AUDIT ENTRY ─────────────────────────────────
    const audit = {
      ts: today.toISOString(),
      date: todayStr,
      raw,
      parsed,
      isTest: true,
      moveChecks: {},
      demoPortfolio,
      form: {
        date: todayStr,
        checking: "8450",
        ally: "22200",
        budgetActuals: { groceries: "245", dining: "135", transport: "110", entertainment: "95", shopping: "115" },
        debts: [
          { name: "Chase Sapphire", balance: "3690", limit: "15000", apr: "24.99", minPayment: "45", nextDue: "" },
        ],
      },
    };

    // ── 5. ASSEMBLE HISTORY ────────────────────────────────────
    const existingRealAudits = history.filter(a => !a.isTest && !a.isDemoHistory);
    const nh = [audit, ...syntheticHistory, ...existingRealAudits].slice(0, 52);

    // ── 6. BUILD FINANCIAL CONFIG OVERLAY (before state updates) ──
    const prevConfig = financialConfig || {};
    const nextFriday = new Date();
    nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7));
    const demoConfig = {
      ...prevConfig,
      _preDemoSnapshot: prevConfig._preDemoSnapshot || { ...prevConfig }, // Save original for restore
      isDemoConfig: true,
      paycheckStandard: prevConfig.paycheckStandard || 2900,
      payday: prevConfig.payday || nextFriday.toISOString().split("T")[0],
      payFrequency: prevConfig.payFrequency || "bi-weekly",
      trackChecking: true,
      weeklySpendAllowance: prevConfig.weeklySpendAllowance || 800,
      emergencyFloor: prevConfig.emergencyFloor || 2000,
      lastCheckingBalance: 8450,
      incomeSources: prevConfig.incomeSources?.length
        ? prevConfig.incomeSources
        : [{ name: "Salary", amount: 5800, frequency: "biweekly" }],
      budgetCategories: prevConfig.budgetCategories?.length
        ? prevConfig.budgetCategories
        : [
          { name: "Groceries", monthlyTarget: 450, icon: "🛒" },
          { name: "Dining", monthlyTarget: 250, icon: "🍽️" },
          { name: "Transport", monthlyTarget: 200, icon: "🚗" },
          { name: "Entertainment", monthlyTarget: 150, icon: "🎬" },
          { name: "Shopping", monthlyTarget: 200, icon: "🛍️" },
        ],
      // FIRE projection inputs
      fireExpectedReturnPct: prevConfig.fireExpectedReturnPct || 7,
      fireInflationPct: prevConfig.fireInflationPct || 2.5,
      fireSafeWithdrawalPct: prevConfig.fireSafeWithdrawalPct || 4,
      // Investment tracking
      enableHoldings: true,
      track401k: true,
      trackRothContributions: true,
      trackBrokerage: true,
      trackCrypto: true,
      holdings:
        prevConfig.holdings && Object.values(prevConfig.holdings).some(a => a?.length)
          ? prevConfig.holdings
          : {
            k401: [{ symbol: "VFIAX", shares: "245", lastKnownPrice: 450 }],
            roth: [{ symbol: "VTI", shares: "52", lastKnownPrice: 260 }],
            brokerage: [{ symbol: "VTSAX", shares: "85", lastKnownPrice: 118 }],
            crypto: [{ symbol: "BTC", shares: "0.15", lastKnownPrice: 62000 }],
          },
      taxBracketPercent: prevConfig.taxBracketPercent || 22,
      k401ContributedYTD: prevConfig.k401ContributedYTD || 8500,
    };

    // ── 6. SET ALL REACT STATE SYNCHRONOUSLY (before awaits) ───
    // This ensures the dashboard renders immediately with full data
    setCurrent(audit);
    setViewing(null);
    setHistory(nh);
    setFinancialConfig(demoConfig);
    if (cards.length === 0) setCards(demoCards);
    if ((renewals || []).length === 0) setRenewals(demoRenewals);

    // ── 7. PERSIST TO DB (async, non-blocking) ─────────────────
    await db.set("current-audit", audit);
    await db.set("audit-history", nh);

    // Seed demo badges
    const existingBadges = (await db.get("unlocked-badges")) || {};
    const demoBadges = {
      ...existingBadges,
      first_audit: existingBadges.first_audit || Date.now(),
      profile_complete: existingBadges.profile_complete || Date.now(),
      score_80: existingBadges.score_80 || Date.now(),
      savings_5k: existingBadges.savings_5k || Date.now(),
      savings_10k: existingBadges.savings_10k || Date.now(),
      net_worth_positive: existingBadges.net_worth_positive || Date.now(),
      investor: existingBadges.investor || Date.now(),
    };
    await db.set("unlocked-badges", demoBadges);
    if (cards.length === 0) await db.set("card-portfolio", demoCards);
    if ((renewals || []).length === 0) await db.set("renewals", demoRenewals);

    toast.success("🎓 Demo audit loaded — explore the full experience!");
    haptic.success();
  };

  const handleRefreshDashboard = async () => {
    // Remove all demo/test AND synthetic demo-history audits
    const cleanedHistory = history.filter(a => !a.isTest && !a.isDemoHistory);
    setHistory(cleanedHistory);
    await db.set("audit-history", cleanedHistory);

    // Find the most recent real (non-test) audit
    const realAudit = cleanedHistory.length > 0 ? cleanedHistory[0] : null;
    if (realAudit) {
      setCurrent(realAudit);
      setMoveChecks(realAudit.moveChecks || {});
      await db.set("current-audit", realAudit);
      await db.set("move-states", realAudit.moveChecks || {});
      toast.success("Dashboard restored to your latest real audit");
    } else {
      setCurrent(null);
      setMoveChecks({});
      await db.del("current-audit");
      await db.del("move-states");
      toast.success("Demo cleared — run your first real audit!");
    }

    // Restore pre-demo financialConfig if we overlaid one
    if (financialConfig?.isDemoConfig && financialConfig._preDemoSnapshot) {
      const restored = { ...financialConfig._preDemoSnapshot };
      delete restored.isDemoConfig;
      delete restored._preDemoSnapshot;
      setFinancialConfig(restored);
    }

    // Clean demo-seeded badges (remove only the ones we added that weren't already there)
    const currentBadges = (await db.get("unlocked-badges")) || {};
    const demoBadgeIds = [
      "first_audit",
      "profile_complete",
      "score_80",
      "savings_5k",
      "savings_10k",
      "net_worth_positive",
      "investor",
    ];
    // Only remove badges that were seeded during THIS demo session (timestamp matches)
    // For simplicity, keep all badges — users may have earned some legitimately
    // Just let evaluateBadges re-check on next real audit

    // Remove demo cards/renewals if they're the demo ones
    const currentCards = cards || [];
    if (currentCards.some(c => c.id?.startsWith("demo-"))) {
      const realCards = currentCards.filter(c => !c.id?.startsWith("demo-"));
      setCards(realCards);
      await db.set("card-portfolio", realCards);
    }
    const currentRenewals = renewals || [];
    if (currentRenewals.some(r => r.id?.startsWith("demo-"))) {
      const realRenewals = currentRenewals.filter(r => !r.id?.startsWith("demo-"));
      setRenewals(realRenewals);
      await db.set("renewals", realRenewals);
    }

    haptic.medium();
  };

  const [isResetting, setIsResetting] = useState(false);
  const resetTimerRef = useRef(null);
  const factoryReset = async () => {
    haptic.warning();
    toast.success("App securely erased. Restarting...");
    setIsResetting(true); // Unmounts SettingsTab immediately

    // Wait for any trailing debounces to flush from React to the DB before wiping
    resetTimerRef.current = setTimeout(async () => {
      await db.clear();
      await db.set("renewals", []);
      await db.set("renewals-seed-version", "v2");
      await db.set("card-portfolio", []);
      await db.set("bank-accounts", []);
      await db.set("personal-rules", "");
      await deleteSecureItem("app-passcode");
      await deleteSecureItem("apple-linked-id");
      await deleteSecureItem("api-key");
      await deleteSecureItem("api-key-openai");
      await db.del("onboarding-complete"); // Guarantee Setup Wizard on reload

      window.location.reload();
    }, 800);
  };
  // Cleanup factory reset timer on unmount
  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    []
  );

  const importBackupFile = async file => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async e => {
        try {
          const backup = JSON.parse(e.target.result);
          if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
            reject(new Error("Invalid Catalyst Cash backup file"));
            return;
          }
          let count = 0;
          for (const [key, val] of Object.entries(backup.data)) {
            if (isSecuritySensitiveKey(key)) continue; // Never import security credentials
            await db.set(key, val);
            count++;
          }
          resolve({ count, exportedAt: backup.exportedAt });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const handleRestoreFromHome = async file => {
    if (!file) return;
    try {
      const { count, exportedAt } = await importBackupFile(file);
      const dateStr = exportedAt ? new Date(exportedAt).toLocaleDateString() : "unknown date";
      toast.success(`Restored ${count} items from backup dated ${dateStr}.`);
      // Short delay to ensure toasts clear and state settles before reload
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(e.message || "Import failed");
    }
  };

  const display = viewing || current;
  const displayMoveChecks = viewing ? viewing.moveChecks || {} : moveChecks;

  const investmentsTabVisible = useMemo(() => {
    const holdings = financialConfig?.holdings || {};
    return (
      (financialConfig?.track401k && holdings.k401?.length > 0) ||
      (financialConfig?.trackRothContributions && holdings.roth?.length > 0) ||
      (financialConfig?.trackBrokerage && holdings.brokerage?.length > 0) ||
      (financialConfig?.trackHSA && holdings.hsa?.length > 0) ||
      (financialConfig?.trackCrypto && holdings.crypto?.length > 0)
    );
  }, [financialConfig]);

  const navItems = [
    { id: "input", label: "New Audit", icon: Plus, isCenter: false },
    { id: "wizard", label: "Card Wizard", icon: Zap, isCenter: false },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, isCenter: true },
    { id: "renewals", label: "Expenses", icon: ReceiptText, isCenter: false },
    {
      id: "cards",
      label: "Portfolio",
      icon: CreditCard,
      isCenter: false,
    },
  ];

  // Native iOS swipe-back is handled via WKWebView allowsBackForwardNavigationGestures
  // (set in capacitor.config.ts). The popstate listener (above) handles the navigation.

  // Native splash auto-hides instantly (launchShowDuration: 0) — no manual dismiss needed

  // ── Haptic on load-complete (premium feel) ──
  const loadReadyRef = useRef(false);
  useEffect(() => {
    if (ready && !loadReadyRef.current) {
      loadReadyRef.current = true;
      haptic.light();
    }
  }, [ready]);

  if (!ready)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          background: T.bg.base,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GlobalStyles />
        <style>{`
@keyframes loadFloat1 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -20px) scale(1.1); } 66% { transform: translate(-20px, 10px) scale(0.95); } }
@keyframes loadFloat2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-35px, -25px) scale(1.15); } }
@keyframes loadFloat3 { 0%, 100% { transform: translate(0, 0) scale(0.9); } 40% { transform: translate(25px, 15px) scale(1.05); } 80% { transform: translate(-15px, -10px) scale(1); } }
@keyframes ringSweep { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes iconBloom { 0% { transform: scale(0.7); opacity: 0; filter: blur(8px); } 100% { transform: scale(1); opacity: 1; filter: blur(0); } }
@keyframes iconPulse { 0%, 100% { box-shadow: 0 12px 48px rgba(0,0,0,0.4), 0 0 30px ${T.accent.primary}15; } 50% { box-shadow: 0 16px 56px rgba(0,0,0,0.5), 0 0 60px ${T.accent.primary}30, 0 0 100px ${T.accent.emerald}10; } }
@keyframes glowPulse { 0%, 100% { opacity: 0.15; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.08); } }
@keyframes particleDrift1 { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.6; } 90% { opacity: 0.6; } 100% { transform: translate(40px, -80px); opacity: 0; } }
@keyframes particleDrift2 { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 0.5; } 85% { opacity: 0.5; } 100% { transform: translate(-50px, -70px); opacity: 0; } }
@keyframes particleDrift3 { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 0.4; } 80% { opacity: 0.4; } 100% { transform: translate(30px, -90px); opacity: 0; } }
@keyframes particleDrift4 { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.5; } 90% { opacity: 0.3; } 100% { transform: translate(-35px, -60px); opacity: 0; } }
@keyframes loadBarFill { 0% { width: 0%; } 20% { width: 25%; } 50% { width: 55%; } 80% { width: 80%; } 100% { width: 95%; } }
@keyframes textReveal { 0% { opacity: 0; transform: translateY(16px); filter: blur(6px); } 100% { opacity: 1; transform: translateY(0); filter: blur(0); } }
@keyframes subtitlePulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    `}</style>

        {/* Ambient gradient blobs — slow floating motion */}
        <div
          style={{
            position: "absolute",
            top: "12%",
            left: "5%",
            width: 240,
            height: 240,
            background: `radial-gradient(circle, ${T.accent.primary}20, transparent 70%)`,
            filter: "blur(60px)",
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "loadFloat1 8s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "15%",
            right: "5%",
            width: 200,
            height: 200,
            background: `radial-gradient(circle, ${T.accent.emerald}18, transparent 70%)`,
            filter: "blur(50px)",
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "loadFloat2 10s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "55%",
            width: 180,
            height: 180,
            background: `radial-gradient(circle, #6C60FF12, transparent 70%)`,
            filter: "blur(55px)",
            borderRadius: "50%",
            pointerEvents: "none",
            animation: "loadFloat3 12s ease-in-out infinite",
          }}
        />

        {/* Icon + Glow Ring */}
        <div
          style={{
            position: "relative",
            width: 120,
            height: 120,
            marginBottom: 36,
            animation: "iconBloom .8s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Pulsing glow behind icon */}
          <div
            style={{
              position: "absolute",
              inset: -20,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${T.accent.primary}30, ${T.accent.emerald}10, transparent 70%)`,
              animation: "glowPulse 3s ease-in-out .6s infinite",
              pointerEvents: "none",
            }}
          />

          {/* Sweeping ring — conic gradient arc */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              animation: "ringSweep 2.5s linear .4s infinite",
              opacity: 0,
              animationFillMode: "forwards",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: `conic-gradient(from 0deg, transparent 0%, ${T.accent.primary}60 15%, ${T.accent.emerald}50 30%, transparent 45%)`,
                mask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #fff calc(100% - 2px))",
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2.5px), #fff calc(100% - 2px))",
              }}
            />
          </div>

          {/* Static subtle ring track */}
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: `1px solid ${T.border.subtle}`,
              pointerEvents: "none",
              animation: "textReveal .5s ease-out .3s both",
            }}
          />

          {/* Floating particles */}
          <div
            style={{
              position: "absolute",
              left: "15%",
              bottom: "10%",
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: T.accent.primary,
              animation: "particleDrift1 3s ease-out .8s infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "10%",
              bottom: "20%",
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: T.accent.emerald,
              animation: "particleDrift2 3.5s ease-out 1.2s infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "45%",
              bottom: "5%",
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: "#6C60FF",
              animation: "particleDrift3 4s ease-out 1.5s infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "30%",
              bottom: "15%",
              width: 2,
              height: 2,
              borderRadius: "50%",
              background: T.accent.primary,
              animation: "particleDrift4 3.2s ease-out 2s infinite",
            }}
          />

          {/* App icon — blooms in, then pulses */}
          <img
            src="/icon-512.png"
            alt=""
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: 28,
              zIndex: 2,
              background: T.bg.base,
              animation: "iconPulse 3s ease-in-out .8s infinite",
            }}
          />
        </div>

        {/* App name — staggered reveal with gradient */}
        <h1
          style={{
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: getTracking(30, 900),
            marginBottom: 6,
            animation: "textReveal .6s ease-out .4s both",
          }}
        >
          <span
            style={{
              background: `linear-gradient(135deg, ${T.text.primary}, ${T.accent.primary}90)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Catalyst Cash
          </span>
        </h1>

        {/* Tagline — warm, human */}
        <p
          style={{
            fontSize: 10,
            color: T.text.dim,
            fontFamily: T.font.mono,
            letterSpacing: "2px",
            fontWeight: 600,
            textTransform: "uppercase",
            marginBottom: 36,
            animation: "textReveal .6s ease-out .6s both",
          }}
        >
          <span style={{ animation: "subtitlePulse 2.5s ease-in-out infinite" }}>Preparing your dashboard</span>
        </p>

        {/* Progress bar — smooth fill */}
        <div
          style={{
            width: 160,
            height: 3,
            borderRadius: 3,
            background: T.border.default,
            overflow: "hidden",
            animation: "textReveal .6s ease-out .8s both",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              background: T.accent.gradient,
              animation: "loadBarFill 3s ease-out forwards",
              boxShadow: `0 0 8px ${T.accent.primary}40`,
            }}
          />
        </div>

        {/* Version */}
        <p
          style={{
            fontSize: 9,
            color: T.text.muted,
            fontFamily: T.font.mono,
            marginTop: 20,
            animation: "textReveal .6s ease-out 1s both",
            opacity: 0.4,
          }}
        >
          v{APP_VERSION}
        </p>
      </div>
    );

  if (!onboardingComplete)
    return (
      <>
        <GlobalStyles />
        <SetupWizard />
      </>
    );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        maxWidth: 800,
        margin: "0 auto",
        background: T.bg.base,
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font.sans,
        overflow: "hidden",
      }}
    >
      {(() => {
        window.__privacyMode = privacyMode;
        return null;
      })()}
      <GlobalStyles />
      {showAiConsent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(24px) saturate(1.8)",
            WebkitBackdropFilter: "blur(24px) saturate(1.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: T.bg.card,
              borderRadius: T.radius.xl,
              border: `1px solid ${T.border.subtle}`,
              padding: 24,
              boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px ${T.border.subtle}`,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: T.text.primary }}>
              AI Data Consent
            </div>
            <p style={{ fontSize: 13, color: T.text.secondary, lineHeight: 1.6, marginBottom: 20 }}>
              When you run an audit, the financial data you enter is sent to your selected AI provider using your API
              key. We do not sell AI access or store your data on our servers. By continuing, you agree to this data
              transfer.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowAiConsent(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: T.radius.lg,
                  border: `1px solid ${T.border.default}`,
                  background: "transparent",
                  color: T.text.secondary,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setAiConsent(true);
                  setShowAiConsent(false);
                  await db.set("ai-consent-accepted", true);
                  toast.success("Consent saved");
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: T.radius.lg,
                  border: "none",
                  background: `linear-gradient(135deg, ${T.accent.primary}, #6C60FF)`,
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 14,
                  boxShadow: `0 4px 12px ${T.accent.primary}40`,
                }}
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} swipeHook={overlaySwipeGuide} />}
      {isLocked && <LockScreen />}
      {showTransactionFeed && (
        <Suspense fallback={<TabFallback />}>
          <TransactionFeed onClose={() => setShowTransactionFeed(false)} />
        </Suspense>
      )}
      {/* Skip-to-content link for a11y */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          top: -60,
          left: 16,
          zIndex: 100,
          background: T.accent.primary,
          color: "#fff",
          padding: "8px 16px",
          borderRadius: T.radius.md,
          fontWeight: 700,
          fontSize: 13,
          transition: "top .2s ease",
        }}
        onFocus={e => (e.target.style.top = "8px")}
        onBlur={e => (e.target.style.top = "-60px")}
      >
        Skip to content
      </a>
      {/* ═══════ HEADER BAR ═══════ */}
      <header
        role="banner"
        ref={topBarRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `calc(env(safe-area-inset-top, 0px) + 4px) 16px 8px 16px`,
          background: T.bg.navGlass,
          flexShrink: 0,
          zIndex: 10,
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderBottom: `1px solid ${T.border.subtle}`,
        }}
      >
        <div style={{
          position: "absolute", bottom: -1, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${T.accent.emerald}40, ${T.accent.primary}60, transparent)`
        }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowGuide(!showGuide)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `1px solid ${showGuide ? T.border.focus : T.border.default}`,
              background: showGuide ? T.bg.surface : T.bg.glass,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: showGuide ? T.accent.primary : T.text.dim,
              transition: "color .2s, border-color .2s",
              visibility: tab === "history" || tab === "settings" || tab === "chat" ? "hidden" : "visible",
            }}
          >
            <Info size={18} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => setPrivacyMode(p => !p)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `1px solid ${privacyMode ? T.border.focus : T.border.default}`,
              background: privacyMode ? T.bg.surface : T.bg.glass,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: privacyMode ? T.accent.primary : T.text.dim,
              transition: "color .2s, border-color .2s",
              visibility:
                tab === "history" || tab === "settings" || tab === "input" || tab === "chat" ? "hidden" : "visible",
            }}
            aria-label={privacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode"}
          >
            {privacyMode ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
          </button>
        </div>

        {/* Center Dynamic Title */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: T.text.primary,
              letterSpacing: getTracking(16, 800),
            }}
          >
            {tab === "dashboard" ? "Command Center" :
             tab === "input" ? "New Audit" :
             tab === "chat" ? "Catalyst AI" :
             tab === "wizard" ? "Card Wizard" :
             tab === "renewals" ? "Expenses" :
             tab === "cards" ? "Accounts" : ""}
          </div>
        </div>

        <button
          onClick={() => (tab === "settings" ? navTo(lastCenterTab.current) : navTo("settings"))}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: `1px solid ${tab === "settings" ? T.border.focus : T.border.default}`,
            background: tab === "settings" ? T.bg.surface : T.bg.glass,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: tab === "settings" ? T.accent.primary : T.text.dim,
            transition: "color .2s, border-color .2s",
            visibility: tab === "settings" ? "hidden" : "visible",
          }}
          aria-label="Open Settings"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </header>

      {/* ═══════ OFFLINE BANNER ═══════ */}
      {!online && (
        <div
          style={{
            background: T.status.amberDim,
            borderBottom: `1px solid ${T.status.amber}30`,
            padding: "6px 16px",
            textAlign: "center",
            fontSize: 11,
            color: T.status.amber,
            fontWeight: 600,
            fontFamily: T.font.mono,
            flexShrink: 0,
          }}
        >
          ⚡ NO INTERNET — Audits unavailable
        </div>
      )}

      <main
        id="main-content"
        role="main"
        ref={snapContainerRef}
        className="snap-container"
        style={{
          flex: 1,
          display: tab === "settings" || tab === "results" || tab === "history" || tab === "guide" ? "none" : "flex",
          overscrollBehaviorX: "none",
          paddingBottom: "calc(var(--bottom-nav-h, 72px) + env(safe-area-inset-bottom, 16px) + 20px)", // Shrink snap-pages to end above the floating nav pill
        }}
      >
        {SWIPE_TAB_ORDER.map(t => (
          <div
            key={t}
            className="snap-page"
            data-tabid={t}
            style={{
              overflowY: t === "chat" ? "hidden" : "auto",
              paddingBottom: t === "chat" ? 0 : 20, // Visual breathing room at scroll bottom (nav clearance handled by container)
            }}
          >
            {t === "input" && (
              <ErrorBoundary name="InputForm">
                <InputForm
                  onSubmit={handleSubmit}
                  isLoading={loading}
                  lastAudit={current}
                  renewals={renewals}
                  cardAnnualFees={cardAnnualFees}
                  cards={cards}
                  bankAccounts={bankAccounts}
                  onManualImport={handleManualImport}
                  toast={toast}
                  financialConfig={financialConfig}
                  setFinancialConfig={setFinancialConfig}
                  aiProvider={aiProvider}
                  personalRules={personalRules}
                  setPersonalRules={setPersonalRules}
                  persona={persona}
                  instructionHash={instructionHash}
                  setInstructionHash={setInstructionHash}
                  db={db}
                  proEnabled={proEnabled}
                  onBack={() => navTo("dashboard")}
                />
              </ErrorBoundary>
            )}



            {t === "dashboard" && (
              <ErrorBoundary name="Dashboard">
                <DashboardTab
                  onRestore={handleRestoreFromHome}
                  proEnabled={proEnabled}
                  onRefreshDashboard={handleRefreshDashboard}
                  onDemoAudit={handleDemoAudit}
                  onViewTransactions={() => setShowTransactionFeed(true)}
                  onDiscussWithCFO={prompt => {
                    setChatInitialPrompt(prompt);
                    navTo("chat");
                  }}
                />
              </ErrorBoundary>
            )}

            {t === "renewals" && (
              <ErrorBoundary name="Expenses">
                <Suspense fallback={<TabFallback />}>
                  <RenewalsTab proEnabled={proEnabled} />
                </Suspense>
              </ErrorBoundary>
            )}

            {t === "cards" && (
              <ErrorBoundary name="Accounts">
                <Suspense fallback={<TabFallback />}>
                  <CardPortfolioTab onViewTransactions={() => setShowTransactionFeed(true)} proEnabled={proEnabled} />
                </Suspense>
              </ErrorBoundary>
            )}

            {t === "wizard" && (
              <ErrorBoundary name="Card Wizard">
                <Suspense fallback={<TabFallback />}>
                  <CardWizardTab />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
        ))}
      </main>

      {/* ERROR OVERLAY */}
      {error && (
        <div style={{ position: "absolute", top: 60, left: 16, right: 16, zIndex: 50 }}>
          <Card
            style={{
              borderColor: `${T.status.red}20`,
              background: T.status.redDim,
              borderLeft: `3px solid ${T.status.red}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={14} color={T.status.red} strokeWidth={2.5} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.status.red }}>Error</span>
              </div>
              <button
                onClick={() => setError(null)}
                style={{ background: "none", border: "none", color: T.text.dim, cursor: "pointer", padding: 4 }}
              >
                <X size={14} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: T.text.secondary, lineHeight: 1.5 }}>{error}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => {
                  setError(null);
                  navTo("input");
                }}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: T.radius.md,
                  border: `1px solid ${T.accent.primary}40`, background: T.accent.primaryDim,
                  color: T.accent.primary, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: T.font.mono,
                }}
              >
                GO TO INPUT
              </button>
              <button
                onClick={() => setError(null)}
                style={{
                  padding: "10px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border.default}`,
                  background: "transparent", color: T.text.secondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                DISMISS
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* FULL SCREEN DEDICATED OVERLAYS (Results, History) */}
      {tab === "results" && (
        <div ref={overlaySwipeResults.paneRef} onTouchStart={overlaySwipeResults.onTouchStart} onTouchMove={overlaySwipeResults.onTouchMove} onTouchEnd={overlaySwipeResults.onTouchEnd} className="slide-pane safe-scroll-body" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 20 }}>
          {loading ? (
            <StreamingView
              streamText={streamText}
              elapsed={elapsed}
              isTest={isTest}
              modelName={getModel(aiProvider, aiModel).name}
              onCancel={handleCancelAudit}
            />
          ) : !display ? (
            (() => {
              setTimeout(() => navTo("dashboard"), 0);
              return null;
            })()
          ) : (
            <>
              <ErrorBoundary name="Results">
                <ResultsView
                  audit={display}
                  moveChecks={displayMoveChecks}
                  onToggleMove={toggleMove}
                  streak={trendContext?.length || 0}
                  onBack={() => {
                    const target = resultsBackTarget === "history" ? "history" : "dashboard";
                    setResultsBackTarget(null);
                    navTo(target);
                  }}
                />
              </ErrorBoundary>
            </>
          )}
        </div>
      )}

      {tab === "history" && (
        <div ref={overlaySwipeHistory.paneRef} onTouchStart={overlaySwipeHistory.onTouchStart} onTouchMove={overlaySwipeHistory.onTouchMove} onTouchEnd={overlaySwipeHistory.onTouchEnd} className="slide-pane safe-scroll-body" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 20 }}>
          <ErrorBoundary name="History">
            <Suspense fallback={<TabFallback />}>
              <HistoryTab toast={toast} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {tab === "chat" && (
        <div ref={overlaySwipeChat.paneRef} onTouchStart={overlaySwipeChat.onTouchStart} onTouchMove={overlaySwipeChat.onTouchMove} onTouchEnd={overlaySwipeChat.onTouchEnd} className="slide-pane safe-scroll-body" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 50, background: T.bg.base }}>
          <ErrorBoundary name="AI Chat">
            <Suspense fallback={<TabFallback />}>
              <AIChatTab
                proEnabled={proEnabled}
                initialPrompt={chatInitialPrompt}
                clearInitialPrompt={() => setChatInitialPrompt(null)}
                onBack={() => {
                  navTo(lastCenterTab.current);
                  haptic.light();
                }}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {tab === "settings" && (
        <ErrorBoundary name="Settings">
          <Suspense fallback={<TabFallback />}>
            <SettingsTab
              apiKey={apiKey}
              setApiKey={setApiKey}
              aiProvider={aiProvider}
              setAiProvider={setAiProvider}
              aiModel={aiModel}
              setAiModel={setAiModel}
              onClear={clearAll}
              onFactoryReset={factoryReset}
              useStreaming={useStreaming}
              setUseStreaming={setUseStreaming}
              financialConfig={financialConfig}
              setFinancialConfig={setFinancialConfig}
              personalRules={personalRules}
              setPersonalRules={setPersonalRules}
              onClearDemoData={handleRefreshDashboard}
              requireAuth={requireAuth}
              setRequireAuth={setRequireAuth}
              appPasscode={appPasscode}
              setAppPasscode={setAppPasscode}
              useFaceId={useFaceId}
              setUseFaceId={setUseFaceId}
              lockTimeout={lockTimeout}
              setLockTimeout={setLockTimeout}
              appleLinkedId={appleLinkedId}
              setAppleLinkedId={setAppleLinkedId}
              notifPermission={notifPermission}
              persona={persona}
              setPersona={setPersona}
              proEnabled={proEnabled}
              onShowGuide={() => setShowGuide(true)}
              navTo={navTo}
              onBack={() => {
                if (setupReturnTab) {
                  navTo(setupReturnTab);
                  setSetupReturnTab(null);
                } else {
                  navTo(lastCenterTab.current);
                }
                haptic.light();
              }}
              onRestoreComplete={() => window.location.reload()}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ═══════ BOTTOM NAV ═══════ */}
      <nav
        aria-label="Main navigation"
        ref={bottomNavRef}
        style={{
          background: T.bg.navGlass,
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: `1px solid ${T.border.default}`,
          borderRadius: 36, // Maximum pill roundness
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)", // Detached from bottom safely
          left: 16, // Detached from edge
          right: 16, // Detached from edge
          zIndex: 200,
          boxShadow: `0 16px 32px -12px rgba(0,0,0,0.6), 0 0 0 1px ${T.border.subtle}`, // Elevated shadow
          // Lock nav while audit runs, hide completely when guide is open
          display: showGuide ? "none" : undefined,
          pointerEvents: loading ? "none" : "auto",
          opacity: loading ? 0.45 : 1,
          transition: "opacity .3s ease",
          overflow: "hidden", // Contained animations
        }}
      >
        {/* QUICK ACTIONS MENU */}
        {showQuickMenu && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 99, background: "transparent" }}
              onClick={() => setShowQuickMenu(false)}
              onTouchStart={() => setShowQuickMenu(false)}
            />
            <div
              style={{
                position: "absolute",
                bottom: "calc(env(safe-area-inset-bottom, 16px) + 76px)",
                left: "50%",
                transform: "translateX(-50%)",
                background: T.bg.glass,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: `1px solid ${T.border.focus}`,
                borderRadius: T.radius.lg,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                zIndex: 100,
                boxShadow: T.shadow.elevated,
                width: 220,
                animation: "slideUpMenu .2s ease",
              }}
            >
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  navTo("input");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "transparent",
                  border: "none",
                  color: T.text.primary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: T.radius.sm,
                }}
              >
                <Plus size={18} color={T.accent.emerald} /> Start New Audit
              </button>
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  navTo("history");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "transparent",
                  border: "none",
                  color: T.text.primary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: T.radius.sm,
                }}
              >
                <Clock size={18} color={T.accent.primary} /> Audit History
              </button>

              <div style={{ height: 1, background: T.border.default, margin: "4px 0" }} />
              <button
                onClick={() => {
                  setShowQuickMenu(false);
                  navTo("settings");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "transparent",
                  border: "none",
                  color: T.text.primary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderRadius: T.radius.sm,
                }}
              >
                <Settings size={18} color={T.text.dim} /> App Configuration
              </button>
            </div>
          </>
        )}

        {/* Audit-running indicator strip */}
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${T.accent.primary}, ${T.accent.emerald}, transparent)`,
              animation: "shimmer 1.8s ease-in-out infinite",
              backgroundSize: "200% 100%",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            top: -1,
            left: "10%",
            right: "10%",
            height: 1,
            background: loading
              ? "none"
              : `linear-gradient(90deg,transparent,${T.accent.primary}25,${T.accent.emerald}20,transparent)`,
          }}
        />

        <div
          role="tablist"
          aria-label="Main navigation tabs"
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-evenly",
            alignItems: "center",
            padding: "8px 4px",
          }}
        >
          {navItems.map(n => {
            const Icon = n.icon;
            const isCenter = n.isCenter;
            const active = tab === n.id;

            const handlePressStart = e => {
              if (e.type === "mousedown" && e.button !== 0) return;
              longPressTimer.current = setTimeout(() => {
                haptic.warning();
                setShowQuickMenu(true);
                longPressTimer.current = null;
              }, 350);
            };

            const handlePressEnd = e => {
              if (e.type === "mouseup" && e.button !== 0) return;
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
                if (tab !== n.id) navTo(n.id);
              }
            };

            return (
              <button
                key={n.id}
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                onMouseDown={isCenter ? handlePressStart : undefined}
                onMouseUp={isCenter ? handlePressEnd : undefined}
                onMouseLeave={
                  isCenter
                    ? () => {
                      if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    }
                    : undefined
                }
                onTouchStart={isCenter ? handlePressStart : undefined}
                onTouchEnd={isCenter ? handlePressEnd : undefined}
                aria-label={n.label}
                onClick={
                  !isCenter
                    ? () => {
                      if (tab !== n.id) {
                        haptic.light();
                        navTo(n.id);
                      }
                    }
                    : undefined
                }
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: active ? 4 : 0, // Tighten gap gracefully
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: active ? T.text.primary : T.text.dim, // High contrast active, dim inactive
                  padding: "4px 0",
                  height: 56, // Perfect touch target size
                  transition: "color .2s ease, gap .3s cubic-bezier(0.16, 1, 0.3, 1)",
                  position: "relative",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              >
                {isCenter ? (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24, // Perfect circle logic
                      background: active ? T.accent.gradient : T.bg.elevated,
                      border: `1px solid ${active ? "transparent" : T.border.default}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: active ? `0 4px 20px ${T.accent.primary}60, 0 0 24px ${T.accent.emerald}40` : T.shadow.card,
                      transition: "all .3s cubic-bezier(0.16, 1, 0.3, 1)",
                      animation: active ? "glowPulse 3s ease-in-out infinite" : "none",
                      transform: active ? "scale(1.05)" : "scale(1)",
                    }}
                  >
                    <Icon size={22} strokeWidth={active ? 2.5 : 1.5} color={active ? "#fff" : T.text.muted} />
                  </div>
                ) : (
                  <div
                    style={{
                      transition: "transform .3s cubic-bezier(0.16, 1, 0.3, 1), opacity .2s",
                      transform: active ? "translateY(-2px)" : "translateY(2px)",
                      opacity: active ? 1 : 0.7, // Mute un-selected icons
                    }}
                  >
                    <Icon size={20} strokeWidth={active ? 2.5 : 2.0} />
                  </div>
                )}
                
                {/* Text only reveals on active for clean UI (unless it is the central button) */}
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  height: active ? 18 : 0, 
                  overflow: "hidden", 
                  transition: "height .3s cubic-bezier(0.16, 1, 0.3, 1), opacity .2s",
                  opacity: active ? 1 : 0
                }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 800,
                      fontFamily: T.font.sans,
                      letterSpacing: "0.03em",
                      marginBottom: 2
                    }}
                  >
                    {n.label}
                  </span>
                  {active && !isCenter && (
                    <div style={{
                      width: 4, height: 4, borderRadius: 2, background: T.accent.emerald,
                      boxShadow: `0 0 8px ${T.accent.emerald}`,
                      marginTop: 2
                    }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Factory Reset Mask */}
      {isResetting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: T.bg.base,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.3s ease-out forwards",
          }}
        >
          <div
            className="spin"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              border: `3px solid ${T.border.default}`,
              borderTopColor: T.accent.primary,
            }}
          />
          <p
            style={{
              marginTop: 24,
              fontSize: 13,
              color: T.text.secondary,
              fontWeight: 600,
              fontFamily: T.font.mono,
              letterSpacing: "0.05em",
            }}
          >
            SECURELY ERASING...
          </p>
        </div>
      )}

      {/* SIMULATED PUSH NOTIFICATION */}
      {simulatedNotification && (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            right: 16,
            zIndex: 9999,
            background: `linear-gradient(135deg, ${T.bg.card}, ${T.bg.surface})`,
            borderRadius: T.radius.xl,
            padding: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            boxShadow: `0 12px 32px rgba(0,0,0,0.8), 0 0 0 1px ${T.border.default}`,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            animation: "slideDownNotif 0.4s cubic-bezier(0.16,1,0.3,1)",
            cursor: "pointer",
          }}
          onClick={() => setSimulatedNotification(null)}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: T.accent.primaryDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <MapPin size={22} color={T.accent.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text.primary, letterSpacing: "-0.01em" }}>
                {simulatedNotification.title}
              </span>
              <span style={{ fontSize: 10, color: T.text.dim, fontFamily: T.font.mono }}>NOW</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: T.text.secondary, lineHeight: 1.4 }}>
              {simulatedNotification.body}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
