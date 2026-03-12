import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { getISOWeekNum } from "../dateHelpers.js";
import { db, parseAudit, cyrb53 } from "../utils.js";
import { streamAudit, callAudit } from "../api.js";
import { generateStrategy, mergeSnapshotDebts } from "../engine.js";
import { buildScrubber } from "../scrubber.js";
import { evaluateBadges, BADGE_DEFINITIONS } from "../badges.js";
import { haptic } from "../haptics.js";
import { useToast } from "../Toast.jsx";
import { getProvider } from "../providers.js";
import { getSystemPrompt } from "../prompts.js";
import { getHistoryLimit, getOrCreateDeviceId, recordAuditUsage } from "../subscription.js";
import { loadMemory, extractAuditMilestones, addMilestones, getMemoryBlock } from "../memory.js";
import { useSettings } from "./SettingsContext.js";
import { usePortfolio } from "./PortfolioContext.js";
import { useNavigation } from "./NavigationContext.jsx";
import type {
  AuditFormData,
  AuditRecord,
  CurrentDebtSnapshot,
  MoveCheckState,
  ParsedAudit,
  TrendContextEntry,
} from "../../types/index.js";

interface AuditProviderProps {
  children: ReactNode;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

interface PromptChatContext {
  summary?: string;
  recent: Array<{ role: string; content: string; ts?: number }>;
}

interface WidgetBridgeApi {
  updateWidgetData: (payload: {
    healthScore?: number | null;
    healthLabel?: string | null;
    netWorth?: number | null;
    weeklyMoves?: number;
    weeklyMovesTotal?: number;
    streak?: number;
    lastAuditDate?: string | null;
  }) => Promise<boolean>;
}

interface NavigationViewingEvent extends Event {
  detail: AuditRecord | null;
}

interface NavigationHistoryState {
  viewingTs?: string | null;
}

interface AuditContextValue {
  current: AuditRecord | null;
  setCurrent: Dispatch<SetStateAction<AuditRecord | null>>;
  history: AuditRecord[];
  setHistory: Dispatch<SetStateAction<AuditRecord[]>>;
  moveChecks: MoveCheckState;
  setMoveChecks: Dispatch<SetStateAction<MoveCheckState>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  useStreaming: boolean;
  setUseStreaming: Dispatch<SetStateAction<boolean>>;
  streamText: string;
  setStreamText: Dispatch<SetStateAction<string>>;
  elapsed: number;
  setElapsed: Dispatch<SetStateAction<number>>;
  viewing: AuditRecord | null;
  setViewing: Dispatch<SetStateAction<AuditRecord | null>>;
  trendContext: TrendContextEntry[];
  setTrendContext: Dispatch<SetStateAction<TrendContextEntry[]>>;
  instructionHash: string | null;
  setInstructionHash: Dispatch<SetStateAction<string | null>>;
  handleSubmit: (msg: string, formData: AuditFormData, testMode?: boolean, manualResultText?: string | null) => Promise<void>;
  handleCancelAudit: () => void;
  clearAll: () => Promise<void>;
  factoryReset: () => Promise<void>;
  deleteHistoryItem: (auditToDelete: AuditRecord) => void;
  isAuditReady: boolean;
  handleManualImport: (resultText: string) => Promise<void>;
  isTest: boolean;
  historyLimit: number;
}

const AuditContext = createContext<AuditContextValue | null>(null);

function migrateHistory(historyItems: AuditRecord[] | null): AuditRecord[] | null {
  if (!historyItems?.length) return historyItems;
  let migrated = false;
  const result = historyItems.map((audit) => {
    if (!audit.moveChecks) {
      migrated = true;
      return { ...audit, moveChecks: {} };
    }
    return audit;
  });
  if (migrated) db.set("audit-history", result);
  return result;
}

export function AuditProvider({ children }: AuditProviderProps) {
  const {
    apiKey,
    aiProvider,
    aiModel,
    persona,
    financialConfig,
    setFinancialConfig,
    personalRules,
    aiConsent,
    setShowAiConsent,
  } = useSettings();

  const { cards, bankAccounts, renewals, cardAnnualFees, setBadges } = usePortfolio();
  const { navTo, onboardingComplete, setResultsBackTarget } = useNavigation();

  const [current, setCurrent] = useState<AuditRecord | null>(null);
  const [history, setHistory] = useState<AuditRecord[]>([]);
  const [moveChecks, setMoveChecks] = useState<MoveCheckState>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [useStreaming, setUseStreaming] = useState<boolean>(true);
  const [streamText, setStreamText] = useState<string>("");
  const [elapsed, setElapsed] = useState<number>(0);
  const [historyLimit, setHistoryLimit] = useState<number>(Infinity);
  const [viewing, setViewing] = useState<AuditRecord | null>(null);
  const [trendContext, setTrendContext] = useState<TrendContextEntry[]>([]);
  const [instructionHash, setInstructionHash] = useState<string | null>(null);
  const [isTest, setIsTest] = useState<boolean>(false);
  const toast = useToast() as ToastApi;
  const [isAuditReady, setIsAuditReady] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getHistoryLimit()
      .then((limit: number) => setHistoryLimit(limit))
      .catch(() => setHistoryLimit(Infinity));
  }, []);

  useEffect(() => {
    const initAudit = async (): Promise<void> => {
      try {
        const [hist, moves, cur, streamingMode, instHash, savedTrend] = (await Promise.all([
          db.get("audit-history"),
          db.get("move-states"),
          db.get("current-audit"),
          db.get("use-streaming"),
          db.get("instruction-hash"),
          db.get("trend-context"),
        ])) as [
          AuditRecord[] | null,
          MoveCheckState | null,
          AuditRecord | null,
          boolean | null,
          string | null,
          TrendContextEntry[] | null,
        ];

        if (hist) setHistory(migrateHistory(hist) || []);
        if (moves) setMoveChecks(moves);
        if (cur) setCurrent(cur);
        if (streamingMode !== null) setUseStreaming(streamingMode);
        if (instHash) setInstructionHash(instHash);
        if (savedTrend) setTrendContext(savedTrend);
      } catch (initError: unknown) {
        console.error("Audit init error:", initError);
      } finally {
        setIsAuditReady(true);
      }
    };
    void initAudit();
  }, []);

  useEffect(() => {
    if (isAuditReady && onboardingComplete) db.set("use-streaming", useStreaming);
  }, [useStreaming, isAuditReady, onboardingComplete]);

  useEffect(() => {
    const handleNavEvent = (event: Event): void => {
      setViewing((event as NavigationViewingEvent).detail);
    };
    window.addEventListener("app-nav-viewing", handleNavEvent);

    const onPopState = (event: PopStateEvent): void => {
      const state = event.state as NavigationHistoryState | null;
      if (state && state.viewingTs !== undefined) {
        if (state.viewingTs === null) {
          setViewing(null);
        } else {
          setHistory((prev) => {
            const audit = prev.find((item) => item.ts === state.viewingTs);
            if (audit) setViewing(audit);
            return prev;
          });
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("app-nav-viewing", handleNavEvent);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const applyContributionAutoUpdate = (parsed: ParsedAudit | null, rawText: string): void => {
    if (!parsed) return;
    let rothDelta = 0;
    let k401Delta = 0;

    const extractAmount = (text: string): number => {
      const match = text.match(/\$([\d,]+(?:\.\d{2})?)/);
      const amount = match?.[1];
      return amount ? parseFloat(amount.replace(/,/g, "")) : 0;
    };

    const scanMoves = (moves: Array<string | { text?: string; description?: string }>): void => {
      moves.forEach((move) => {
        const text = (typeof move === "string" ? move : move.text || move.description || "").toString();
        if (/roth/i.test(text)) rothDelta = Math.max(rothDelta, extractAmount(text));
        if (/401k|401 k/i.test(text)) k401Delta = Math.max(k401Delta, extractAmount(text));
      });
    };

    const structuredMoves = parsed.structured?.moves;
    if (Array.isArray(structuredMoves) && structuredMoves.length) {
      scanMoves(structuredMoves as Array<string | { text?: string; description?: string }>);
    } else if (parsed.moveItems?.length) {
      scanMoves(parsed.moveItems);
    } else if (parsed.sections?.moves) {
      scanMoves(parsed.sections.moves.split("\n"));
    } else if (rawText) {
      scanMoves(rawText.split("\n"));
    }

    if (!financialConfig?.trackRothContributions && !financialConfig?.track401k) return;

    setFinancialConfig((prev) => {
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

  const handleSubmit = useCallback<AuditContextValue["handleSubmit"]>(
    async (msg, formData, testMode = false, manualResultText = null) => {
      const trimmedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
      const provider = getProvider(aiProvider) as { isBackend?: boolean; supportsStreaming?: boolean };
      const isBackendMode = !!provider.isBackend;
      if (!manualResultText && !isBackendMode && !trimmedApiKey) {
        toast.error("Set your API key in Settings first.");
        navTo("settings");
        return;
      }
      if (!manualResultText && !aiConsent) {
        setShowAiConsent(true);
        return;
      }
      if (!manualResultText && !navigator.onLine) {
        toast.error("You're offline.");
        return;
      }
      setIsTest(testMode);
      setLoading(true);
      setError(null);
      navTo("results");
      setStreamText("");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
      const controller = new AbortController();
      abortRef.current = controller;

      let nextHistory: AuditRecord[] = history;

      try {
        let raw = "";
        if (manualResultText) {
          raw = manualResultText;
          setStreamText(raw);
        } else {
          const useStream = useStreaming && !!provider.supportsStreaming;
          const promptRenewals = [...renewals, ...cardAnnualFees];

          const strategyCards = mergeSnapshotDebts(cards || [], (formData?.debts || []) as never[], financialConfig?.defaultAPR || 0) as typeof cards;
          const computedStrategy = generateStrategy(financialConfig, {
            checkingBalance: parseFloat(String(formData.checking || 0)),
            savingsTotal: parseFloat(String(formData.savings || 0)),
            cards: strategyCards,
            renewals: promptRenewals,
            snapshotDate: formData.date,
          });

          const [chatSummary, chatHistory] = (await Promise.all([db.get("ai-chat-summary"), db.get("ai-chat-history")])) as [
            { text?: string } | null,
            Array<{ role: string; content: string; ts?: number }> | null,
          ];

          let chatContext: PromptChatContext | null = null;
          if (chatSummary?.text || chatHistory?.length) {
            const historyArray = Array.isArray(chatHistory) ? chatHistory : [];
            const recent = historyArray.filter((message) => Date.now() - (message.ts || 0) < 24 * 60 * 60 * 1000).slice(-10);
            chatContext = chatSummary?.text ? { summary: chatSummary.text, recent } : { recent };
          }

          const scrubber = buildScrubber(cards, promptRenewals, financialConfig, formData) as {
            scrub: (input: string) => string;
            unscrub: (input: string) => string;
          };

          const memory = (await loadMemory().catch(() => ({ facts: [], milestones: [] }))) as {
            facts: unknown[];
            milestones: unknown[];
          };
          const memBlock = getMemoryBlock(memory);

          const rawLivePrompt = (getSystemPrompt as unknown as (
            provider: string,
            financialConfig: unknown,
            cards: unknown[],
            promptRenewals: unknown[],
            personalRules: string,
            trendContext: unknown[],
            persona: string | null,
            computedStrategy: unknown,
            chatContext: PromptChatContext | null,
            memBlock: unknown
          ) => string)(
            aiProvider || "gemini",
            financialConfig,
            cards,
            promptRenewals,
            personalRules || "",
            trendContext,
            persona,
            computedStrategy,
            chatContext,
            memBlock
          );
          const livePrompt = scrubber.scrub(rawLivePrompt);
          const liveHash = cyrb53(livePrompt).toString();
          const historyKey = `api-history-${aiProvider || "gemini"}`;
          const hashKey = `api-history-hash-${aiProvider || "gemini"}`;
          const lastHash = (await db.get(hashKey)) as string | null;
          let apiHistory = ((await db.get(historyKey)) as Array<{ role: string; content: string }> | null) || [];
          if (lastHash !== liveHash) {
            apiHistory = [];
            await db.set(hashKey, liveHash);
            setInstructionHash(liveHash);
            db.set("instruction-hash", liveHash);
          }

          if (apiHistory.length > 6) apiHistory = apiHistory.slice(-6);

          const historyForProvider =
            aiProvider === "gemini"
              ? apiHistory.map((message) => ({
                  role: message.role === "assistant" ? "model" : "user",
                  parts: [{ text: scrubber.scrub(message.content) }],
                }))
              : apiHistory.map((message) => ({ ...message, content: scrubber.scrub(message.content) }));

          const scrubbedMsg = scrubber.scrub(msg);
          const deviceId = await getOrCreateDeviceId();
          if (useStream) {
            for await (const chunk of streamAudit(
              trimmedApiKey,
              scrubbedMsg,
              aiProvider,
              aiModel,
              livePrompt,
              historyForProvider,
              deviceId,
              controller.signal
            )) {
              raw += chunk;
              setStreamText(scrubber.unscrub(raw));
            }
          } else {
            raw = (await callAudit(
              trimmedApiKey,
              scrubbedMsg,
              aiProvider,
              aiModel,
              livePrompt,
              historyForProvider,
              deviceId
            )) as string;
          }

          raw = scrubber.unscrub(raw);
          const newApiHistory = [...apiHistory, { role: "user", content: msg }, { role: "assistant", content: raw }];
          await db.set(historyKey, newApiHistory.slice(-8));
        }

        const parsed = parseAudit(raw) as ParsedAudit | null;
        if (!parsed) throw new Error("Model output was not valid audit JSON. Please retry.");
        const audit: AuditRecord = {
          date: formData.date,
          ts: new Date().toISOString(),
          form: formData,
          parsed,
          isTest: testMode,
          moveChecks: {},
        };

        if (testMode) {
          setViewing(audit);
          nextHistory = [audit, ...history].slice(0, 52);
          setHistory(nextHistory);
          await db.set("audit-history", nextHistory);
        } else {
          applyContributionAutoUpdate(parsed, raw);
          setCurrent(audit);
          setMoveChecks({});
          setViewing(null);
          nextHistory = [audit, ...history].slice(0, 52);
          setHistory(nextHistory);

          const trendEntry: TrendContextEntry = {
            week: getISOWeekNum(formData.date),
            date: formData.date,
            checking: String(formData.checking || "0"),
            vault: String(formData.ally || "0"),
            totalDebt:
              formData.debts?.reduce((sum, debt) => sum + (parseFloat(String(debt.balance)) || 0), 0).toFixed(0) || "0",
            score: parsed.healthScore?.score || null,
            status: parsed.status || "UNKNOWN",
          };
          setTrendContext((prev) => {
            const next = [...prev, trendEntry].slice(-12);
            db.set("trend-context", next);
            return next;
          });

          const newMilestones = extractAuditMilestones(parsed, history) as string[];
          if (newMilestones.length > 0) {
            addMilestones(newMilestones).catch(() => {});
          }

          await Promise.all([db.set("current-audit", audit), db.set("move-states", {}), db.set("audit-history", nextHistory)]);

          if (formData.debts?.length) {
            const debtSnapshot: CurrentDebtSnapshot = {
              ts: Date.now(),
              debts: formData.debts
                .filter((debt) => parseFloat(String(debt.balance)) > 0)
                .map((debt) => ({
                  name: debt.name || "Debt",
                  balance: parseFloat(String(debt.balance)) || 0,
                  apr: parseFloat(String(debt.apr)) || 0,
                  minPayment: parseFloat(String(debt.minPayment)) || 0,
                  limit: parseFloat(String(debt.limit)) || 0,
                })),
            };
            db.set("current-debts", debtSnapshot);
          }
        }
        haptic.success();
        toast.success(testMode ? "Test audit complete — saved to history" : "Audit imported successfully");

        if (!testMode && !manualResultText) {
          recordAuditUsage().catch(() => {});
        }

        if (!testMode) {
          let computedStreak = 0;
          try {
            const { computeStreak } = (await import("../dateHelpers.js")) as {
              computeStreak: (audits: AuditRecord[]) => number;
            };
            computedStreak = computeStreak(nextHistory);

            const { unlocked, newlyUnlocked } = (await evaluateBadges({
              history: nextHistory,
              streak: computedStreak,
              financialConfig,
              persona,
              current: audit,
            })) as { unlocked: Record<string, number>; newlyUnlocked: string[] };
            setBadges(unlocked);
            if (newlyUnlocked.length > 0) {
              const names = newlyUnlocked
                .map((id) => BADGE_DEFINITIONS.find((badge: { id: string; name: string }) => badge.id === id)?.name)
                .filter((name): name is string => Boolean(name));
              if (names.length) toast.success(`🏆 Badge unlocked: ${names.join(", ")}!`);
            }
          } catch (badgeError: unknown) {
            console.error("Badge eval failed:", badgeError);
          }

          try {
            const { updateWidgetData } = (await import("../widgetBridge.js")) as WidgetBridgeApi;
            await updateWidgetData({
              healthScore: parsed?.healthScore?.score ?? null,
              healthLabel: parsed?.status || "",
              netWorth: null,
              weeklyMoves: Object.values(moveChecks).filter(Boolean).length,
              weeklyMovesTotal: parsed?.moveItems?.length || 0,
              streak: computedStreak,
              lastAuditDate: audit.date,
            });
          } catch {
            // widget bridge not critical
          }
        }
      } catch (submitError: unknown) {
        const message = submitError instanceof Error ? submitError.message : "Unknown error";
        const isBackgroundAbort =
          message.includes("aborted") ||
          message.includes("Failed to fetch") ||
          message.includes("network") ||
          message.includes("Load failed");
        if (isBackgroundAbort && document.hidden) {
          setError(
            "The audit was interrupted because the app went to the background. Please return to the Input tab and try again."
          );
          toast.error("Audit interrupted — app was backgrounded. Tap to retry.");
        } else {
          setError(message);
          toast.error(message || "Audit failed");
        }
        navTo("input");
        haptic.error();
      } finally {
        setLoading(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    },
    [
      aiConsent,
      aiModel,
      aiProvider,
      apiKey,
      cardAnnualFees,
      cards,
      financialConfig,
      history,
      moveChecks,
      navTo,
      persona,
      personalRules,
      renewals,
      setBadges,
      setFinancialConfig,
      setShowAiConsent,
      toast,
      trendContext,
      useStreaming,
    ]
  );

  const handleCancelAudit = useCallback((): void => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setLoading(false);
    setStreamText((prev) => prev + "\n\n[Audit Cancelled by User]");

    setTimeout(() => {
      setError("Audit was cancelled.");
      if (history.length > 0) {
        setViewing(history[0] || null);
      } else {
        navTo("dashboard");
      }
    }, 1500);
  }, [history, navTo]);

  const clearAll = useCallback(async (): Promise<void> => {
    await db.clear();
    setHistory([]);
    setCurrent(null);
    setViewing(null);
    setMoveChecks({});
  }, []);

  const factoryReset = useCallback(async (): Promise<void> => {
    await clearAll();
    window.location.reload();
  }, [clearAll]);

  const deleteHistoryItem = useCallback((auditToDelete: AuditRecord): void => {
    const isMatch = (left: AuditRecord, right: AuditRecord): boolean => left.ts === right.ts;
    setHistory((prev) => {
      const next = prev.filter((item) => !isMatch(item, auditToDelete));
      db.set("audit-history", next);

      if (current && isMatch(current, auditToDelete)) {
        const nextCurrent = next.length > 0 ? next[0] || null : null;
        setCurrent(nextCurrent);
        db.set("current-audit", nextCurrent);
      }
      return next;
    });
    setViewing(null);
    navTo("history");
  }, [current, navTo]);

  const handleManualImport = useCallback(async (resultText: string): Promise<void> => {
    if (!resultText) return;
    setResultsBackTarget("history");
    setLoading(true);
    setError(null);
    navTo("results");
    setStreamText(resultText);
    try {
      const parsed = parseAudit(resultText) as ParsedAudit | null;
      if (!parsed) throw new Error("Imported text is not valid Catalyst Cash audit JSON.");
      applyContributionAutoUpdate(parsed, resultText);
      const today = new Date().toISOString().split("T")[0] ?? new Date().toISOString().slice(0, 10);
      const audit: AuditRecord = {
        date: today,
        ts: new Date().toISOString(),
        form: { date: today },
        parsed,
        isTest: false,
        moveChecks: {},
      };
      setCurrent(audit);
      setMoveChecks({});
      setViewing(null);
      setHistory((prev) => {
        const next = [audit, ...prev].slice(0, 52);
        db.set("audit-history", next);
        return next;
      });
      await Promise.all([db.set("current-audit", audit), db.set("move-states", {})]);
      haptic.success();
      toast.success("Audit imported successfully");
    } catch (importError: unknown) {
      const message = importError instanceof Error ? importError.message : "Failed to parse response";
      setError(message);
      haptic.error();
      toast.error(message);
    } finally {
      setLoading(false);
      setStreamText("");
    }
  }, [applyContributionAutoUpdate, navTo, setResultsBackTarget, toast]);

  const value: AuditContextValue = {
    current,
    setCurrent,
    history,
    setHistory,
    moveChecks,
    setMoveChecks,
    loading,
    setLoading,
    error,
    setError,
    useStreaming,
    setUseStreaming,
    streamText,
    setStreamText,
    elapsed,
    setElapsed,
    viewing,
    setViewing,
    trendContext,
    setTrendContext,
    instructionHash,
    setInstructionHash,
    handleSubmit,
    handleCancelAudit,
    clearAll,
    factoryReset,
    deleteHistoryItem,
    isAuditReady,
    handleManualImport,
    isTest,
    historyLimit,
  };

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export const useAudit = (): AuditContextValue => {
  const context = useContext(AuditContext);
  if (!context) throw new Error("useAudit must be used within an AuditProvider");
  return context;
};
