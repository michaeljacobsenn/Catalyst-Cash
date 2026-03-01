import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { db, parseAudit, cyrb53 } from '../utils.js';
import { streamAudit, callAudit } from '../api.js';
import { generateStrategy } from '../engine.js';
import { buildScrubber } from '../scrubber.js';
import { evaluateBadges, BADGE_DEFINITIONS } from '../badges.js';
import { haptic } from '../haptics.js';
import { useToast } from '../Toast.jsx';
import { getProvider, getModel } from '../providers.js';
import { getSystemPrompt } from '../prompts.js';
import { log } from '../logger.js';
import { getHistoryLimit, getOrCreateDeviceId, recordAuditUsage } from '../subscription.js';
import { useSettings } from './SettingsContext.jsx';
import { usePortfolio } from './PortfolioContext.jsx';
import { useNavigation } from './NavigationContext.jsx';

const AuditContext = createContext(null);

// Migrate historical audits
function migrateHistory(hist) {
  if (!hist?.length) return hist;
  let migrated = false;
  const result = hist.map(a => {
    if (!a.moveChecks) { migrated = true; return { ...a, moveChecks: {} }; }
    return a;
  });
  if (migrated) db.set("audit-history", result);
  return result;
}

export function AuditProvider({ children }) {
  const {
    apiKey, aiProvider, aiModel, persona, financialConfig, setFinancialConfig, personalRules, aiConsent, setShowAiConsent
  } = useSettings();

  const { cards, bankAccounts, renewals, cardAnnualFees, setBadges } = usePortfolio();
  const { setTab, navTo, onboardingComplete, setResultsBackTarget } = useNavigation();

  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [moveChecks, setMoveChecks] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useStreaming, setUseStreaming] = useState(true);
  const [streamText, setStreamText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(Infinity);
  const [viewing, setViewing] = useState(null);
  const [trendContext, setTrendContext] = useState([]);
  const [instructionHash, setInstructionHash] = useState(null);
  const [isTest, setIsTest] = useState(false);
  const toast = useToast();

  const [isAuditReady, setIsAuditReady] = useState(false);

  const timerRef = useRef(null);
  const abortRef = useRef(null);

  // Resolve subscription history limit
  useEffect(() => { getHistoryLimit().then(setHistoryLimit).catch(() => setHistoryLimit(Infinity)); }, []);

  // Initialize History
  useEffect(() => {
    const initAudit = async () => {
      try {
        const [hist, moves, cur, sm, instHash, savedTrend] = await Promise.all([
          db.get("audit-history"),
          db.get("move-states"),
          db.get("current-audit"),
          db.get("use-streaming"),
          db.get("instruction-hash"),
          db.get("trend-context")
        ]);

        if (hist) setHistory(migrateHistory(hist));
        if (moves) setMoveChecks(moves);
        if (cur) setCurrent(cur);
        if (sm !== null) setUseStreaming(sm);
        if (instHash) setInstructionHash(instHash);
        if (savedTrend) setTrendContext(savedTrend);

      } catch (e) {
        console.error('Audit init error:', e);
      } finally {
        setIsAuditReady(true);
      }
    };
    initAudit();
  }, []);

  // Sync to DB
  useEffect(() => { if (isAuditReady && onboardingComplete) db.set("use-streaming", useStreaming); }, [useStreaming, isAuditReady, onboardingComplete]);

  // Handle navigation popstate for viewing history
  useEffect(() => {
    const handleNavEvent = (e) => {
      setViewing(e.detail);
    };
    window.addEventListener('app-nav-viewing', handleNavEvent);

    const onPopState = (e) => {
      const st = e.state;
      if (st && st.viewingTs !== undefined) {
        if (st.viewingTs === null) {
          setViewing(null);
        } else {
          setHistory(prev => {
            const audit = prev.find(a => a.ts === st.viewingTs);
            if (audit) setViewing(audit);
            return prev;
          });
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener('app-nav-viewing', handleNavEvent);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const getISOWeekNum = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  const getISOWeek = (ds) => {
    if (!ds) return null; const d = new Date(ds);
    const w = getISOWeekNum(d); return `${d.getFullYear()}-W${w.toString().padStart(2, '0')}`;
  };

  const applyContributionAutoUpdate = (parsed, rawText) => {
    if (!parsed) return;
    let rothDelta = 0;
    let k401Delta = 0;

    const extractAmount = (txt) => {
      const m = txt.match(/\$([\d,]+(?:\.\d{2})?)/);
      return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
    }; const scanMoves = (moves = []) => {
      moves.forEach(m => {
        const text = (m.text || m.description || m).toString();
        if (/roth/i.test(text)) rothDelta = Math.max(rothDelta, extractAmount(text));
        if (/401k|401 k/i.test(text)) k401Delta = Math.max(k401Delta, extractAmount(text));
      });
    };

    if (parsed.structured?.moves?.length) {
      scanMoves(parsed.structured.moves);
    } else if (parsed.moveItems?.length) {
      scanMoves(parsed.moveItems);
    } else if (parsed.sections?.moves) {
      scanMoves(parsed.sections.moves.split("\n"));
    } else if (rawText) {
      scanMoves(rawText.split("\n"));
    }

    if (!financialConfig?.trackRothContributions && !financialConfig?.track401k) return;

    setFinancialConfig(prev => {
      const next = { ...prev };
      if (prev.trackRothContributions && prev.autoTrackRothYTD !== false && rothDelta > 0) {
        next.rothContributedYTD = Math.max(0, (prev.rothContributedYTD || 0) + rothDelta);
        if (prev.rothAnnualLimit) next.rothContributedYTD = Math.min(next.rothContributedYTD, prev.rothAnnualLimit);
      }
      if (prev.track401k && prev.autoTrack401kYTD !== false && k401Delta > 0) {
        next.k401ContributedYTD = Math.max(0, (prev.k401ContributedYTD || 0) + k401Delta);
        if (prev.k401AnnualLimit) next.k401ContributedYTD = Math.min(next.k401ContributedYTD, prev.k401AnnualLimit);
      }
      return next;
    });
  };

  const handleSubmit = useCallback(async (msg, formData, testMode = false, manualResultText = null) => {
    const trimmedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
    const prov = getProvider(aiProvider);
    const isBackendMode = prov.isBackend;
    if (!manualResultText && !isBackendMode && !trimmedApiKey) { toast.error("Set your API key in Settings first."); navTo("settings"); return; }
    if (!manualResultText && !aiConsent) { setShowAiConsent(true); return; }
    if (!manualResultText && !navigator.onLine) { toast.error("You're offline."); return; }
    setIsTest(testMode);
    setLoading(true); setError(null); navTo("results"); setStreamText(""); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let raw = "";
      if (manualResultText) {
        raw = manualResultText;
        setStreamText(raw);
      } else {
        const useStream = useStreaming && prov.supportsStreaming;
        const promptRenewals = [...(renewals || []), ...(cardAnnualFees || [])];

        // Native Engine Run: Calculate floors, targets, and debt override natively before prompt generation
        const computedStrategy = generateStrategy(financialConfig, {
          checkingBalance: parseFloat(formData.checking || 0),
          savingsTotal: parseFloat(formData.savings || 0),
          cards: cards || [],
          renewals: promptRenewals,
          snapshotDate: formData.date
        });

        // Initialize PII Scrubber
        const scrubber = buildScrubber(cards, promptRenewals, financialConfig, formData);

        // Scrub the system prompt
        const rawLivePrompt = getSystemPrompt(aiProvider || "gemini", financialConfig, cards, promptRenewals, personalRules || "", trendContext, persona, computedStrategy);
        const livePrompt = scrubber.scrub(rawLivePrompt);
        const liveHash = cyrb53(livePrompt).toString();
        const histKey = `api-history-${aiProvider || "gemini"}`;
        const hashKey = `api-history-hash-${aiProvider || "gemini"}`;
        const lastHash = await db.get(hashKey);
        let history = (await db.get(histKey)) || [];
        if (lastHash !== liveHash) {
          history = [];
          await db.set(hashKey, liveHash);
          setInstructionHash(liveHash);
          db.set("instruction-hash", liveHash);
        }

        // Trim history to last 6 messages to control token growth
        if (history.length > 6) history = history.slice(-6);

        // Scrub history
        const historyForProvider = (aiProvider === "gemini")
          ? history.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: scrubber.scrub(m.content) }] }))
          : history.map(m => ({ ...m, content: scrubber.scrub(m.content) })); // openai & claude

        // Scrub user message
        const scrubbedMsg = scrubber.scrub(msg);

        // Execute API Call — deviceId for backend rate limiting
        const deviceId = await getOrCreateDeviceId();
        if (useStream) {
          for await (const chunk of streamAudit(trimmedApiKey, scrubbedMsg, aiProvider, aiModel, livePrompt, historyForProvider, deviceId, controller.signal)) {
            raw += chunk;
            setStreamText(scrubber.unscrub(raw)); // Unscrub on the fly for viewing
          }
        } else {
          raw = await callAudit(trimmedApiKey, scrubbedMsg, aiProvider, aiModel, livePrompt, historyForProvider, deviceId);
        }

        // Unscrub the final raw text before parsing and saving
        raw = scrubber.unscrub(raw);

        // Save real names to local device history
        const newHistory = [...history, { role: "user", content: msg }, { role: "assistant", content: raw }];
        await db.set(histKey, newHistory.slice(-8));
      }
      const parsed = parseAudit(raw);
      if (!parsed) throw new Error("Model output was not valid audit JSON. Please retry.");
      const audit = { date: formData.date, ts: new Date().toISOString(), form: formData, parsed, isTest: testMode, moveChecks: {} };

      if (testMode) {
        // Save test audits to history (flagged as isTest) but don't set as current
        setViewing(audit);
        const nh = [audit, ...history].slice(0, 52); setHistory(nh);
        await db.set("audit-history", nh);
      } else {
        applyContributionAutoUpdate(parsed, raw);
        setCurrent(audit); setMoveChecks({}); setViewing(null);
        const nh = [audit, ...history].slice(0, 52); setHistory(nh);

        // Extract compact trend metrics for AI context injection
        const getISOWeekNum = (d) => { const dt = new Date(d); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7); const w1 = new Date(dt.getFullYear(), 0, 4); return 1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7); };
        const trendEntry = {
          week: getISOWeekNum(formData.date),
          date: formData.date,
          checking: formData.checking || "0",
          vault: formData.ally || "0",
          totalDebt: formData.debts?.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0).toFixed(0) || "0",
          score: parsed.healthScore?.score || null,
          status: parsed.status || "UNKNOWN"
        };
        setTrendContext(prev => {
          const next = [...prev, trendEntry].slice(-8);
          db.set("trend-context", next);
          return next;
        });
        await Promise.all([db.set("current-audit", audit), db.set("move-states", {}), db.set("audit-history", nh)]);

        // Persist debt snapshot for cross-component access (DebtSimulator fallback)
        if (formData.debts?.length) {
          db.set("current-debts", {
            ts: Date.now(),
            debts: formData.debts.filter(d => parseFloat(d.balance) > 0).map(d => ({
              name: d.name || "Debt", balance: parseFloat(d.balance) || 0,
              apr: parseFloat(d.apr) || 0, minPayment: parseFloat(d.minPayment) || 0,
              limit: parseFloat(d.limit) || 0
            }))
          });
        }
      }
      haptic.success();
      toast.success(testMode ? "Test audit complete — saved to history" : "Audit imported successfully");

      // Record audit usage for subscription quota tracking
      if (!testMode && !manualResultText) {
        recordAuditUsage().catch(() => { });
      }

      // Evaluate badges after audit
      if (!testMode) {
        let computedStreak = 0;
        try {
          // Compute actual streak from audit history
          const getISOWeek = (ds) => { const dt = new Date(ds); dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7); const w1 = new Date(dt.getFullYear(), 0, 4); return `${dt.getFullYear()}-W${String(1 + Math.round(((dt - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`; };
          const realForStreak = nh.filter(a => !a.isTest && a.date);
          const weeks = [...new Set(realForStreak.map(a => getISOWeek(a.date)))].sort().reverse();
          if (weeks.length) {
            const curWeek = getISOWeek(new Date().toISOString().split("T")[0]);
            let checkW = weeks[0] === curWeek ? curWeek : weeks[0];
            for (const w of weeks) { if (w === checkW) { computedStreak++; const d = new Date(checkW.slice(0, 4), 0, 1); d.setDate(d.getDate() + (parseInt(checkW.slice(6)) - 2) * 7); checkW = getISOWeek(d.toISOString().split("T")[0]); } else break; }
          }
          const { unlocked, newlyUnlocked } = await evaluateBadges({ history: nh, streak: computedStreak, financialConfig, persona, current: audit });
          setBadges(unlocked);
          if (newlyUnlocked.length > 0) {
            const names = newlyUnlocked.map(id => BADGE_DEFINITIONS.find(b => b.id === id)?.name).filter(Boolean);
            if (names.length) toast.success(`🏆 Badge unlocked: ${names.join(", ")}!`);
          }
        } catch (e) { console.error("Badge eval failed:", e); }

        // Update iOS Home Screen widget data
        try {
          const { updateWidgetData } = await import("../widgetBridge.js");
          await updateWidgetData({
            healthScore: parsed?.healthScore?.score ?? null,
            healthLabel: parsed?.status || "",
            netWorth: null, // computed from dashboard
            weeklyMoves: Object.values(moveChecks).filter(Boolean).length,
            weeklyMovesTotal: parsed?.moveItems?.length || 0,
            streak: computedStreak,
            lastAuditDate: audit.date,
          });
        } catch { /* widget bridge not critical */ }
      }

      // Confetti is handled by DashboardTab's react-confetti (score >= 95)
    } catch (e) {
      const msg = e.message || "Unknown error";
      // Distinguish background suspension from real API failures
      const isBackgroundAbort = msg.includes("aborted") || msg.includes("Failed to fetch") || msg.includes("network") || msg.includes("Load failed");
      if (isBackgroundAbort && document.hidden) {
        // App was backgrounded — don't show error, wait for resume
        setError("The audit was interrupted because the app went to the background. Please return to the Input tab and try again.");
        toast.error("Audit interrupted — app was backgrounded. Tap to retry.");
      } else {
        setError(msg);
        toast.error(msg || "Audit failed");
      }
      navTo("input"); haptic.error();
    }
    finally { setLoading(false); clearInterval(timerRef.current); }
  }, [apiKey, useStreaming, navTo, history, cards, renewals, financialConfig, personalRules, persona, aiProvider, aiModel, aiConsent, setFinancialConfig, setInstructionHash, setCurrent, setMoveChecks, setViewing, setHistory, setTrendContext, cardAnnualFees, setBadges, toast, setShowAiConsent, isTest, setIsTest]);

  const handleCancelAudit = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearInterval(timerRef.current);
    setLoading(false);
    setStreamText(prev => prev + "\n\n[Audit Cancelled by User]");

    setTimeout(() => {
      setError("Audit was cancelled.");
      // If we have history, show the latest instead of getting stuck on empty results
      if (history.length > 0) {
        setViewing(history[0]);
      } else {
        navTo("dashboard");
      }
    }, 1500);
  }, [history, navTo]);

  const clearAll = useCallback(async () => {
    await db.clear();
    setHistory([]);
    setCurrent(null);
    setViewing(null);
    setMoveChecks({});
  }, []);

  const factoryReset = useCallback(async () => {
    await clearAll();
    window.location.reload();
  }, [clearAll]);

  const deleteHistoryItem = useCallback((auditToDelete) => {
    const isMatch = (a, b) => a.ts === b.ts;
    setHistory(prev => {
      const next = prev.filter(x => !isMatch(x, auditToDelete));
      db.set("audit-history", next);

      if (current && isMatch(current, auditToDelete)) {
        const nextCurrent = next.length > 0 ? next[0] : null;
        setCurrent(nextCurrent);
        db.set("current-audit", nextCurrent);
      }
      return next;
    });
    setViewing(null);
    navTo("history");
  }, [current, navTo]);

  const handleManualImport = useCallback(async (resultText) => {
    if (!resultText) return;
    setResultsBackTarget("history");
    setLoading(true); setError(null); navTo("results"); setStreamText(resultText);
    try {
      const parsed = parseAudit(resultText);
      if (!parsed) throw new Error("Imported text is not valid Catalyst Cash audit JSON.");
      applyContributionAutoUpdate(parsed, resultText);
      const today = new Date().toISOString().split("T")[0];
      const audit = { date: today, ts: new Date().toISOString(), form: { date: today }, parsed, isTest: false, moveChecks: {} };
      setCurrent(audit); setMoveChecks({}); setViewing(null);
      setHistory(prev => {
        const nh = [audit, ...prev].slice(0, 52);
        db.set("audit-history", nh);
        return nh;
      });
      await Promise.all([db.set("current-audit", audit), db.set("move-states", {})]);
      haptic.success();
      toast.success("Audit imported successfully");
    } catch (e) {
      setError(e.message || "Failed to parse response");
      haptic.error();
      toast.error(e.message || "Failed to parse audit response");
    }
    finally { setLoading(false); setStreamText(""); }
  }, [navTo, setResultsBackTarget, history, toast, financialConfig, trendContext]);

  const value = {
    current, setCurrent,
    history, setHistory,
    moveChecks, setMoveChecks,
    loading, setLoading,
    error, setError,
    useStreaming, setUseStreaming,
    streamText, setStreamText,
    elapsed, setElapsed,
    viewing, setViewing,
    trendContext, setTrendContext,
    instructionHash, setInstructionHash,
    handleSubmit,
    handleCancelAudit,
    clearAll,
    factoryReset,
    deleteHistoryItem,
    isAuditReady,
    handleManualImport,
    isTest,
    historyLimit
  };

  return (
    <AuditContext.Provider value={value}>
      {children}
    </AuditContext.Provider>
  );
}

export const useAudit = () => {
  const context = useContext(AuditContext);
  if (!context) throw new Error("useAudit must be used within an AuditProvider");
  return context;
};
