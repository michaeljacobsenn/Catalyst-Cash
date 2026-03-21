import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  AuditFormData,
  AuditRecord,
  CurrentDebtSnapshot,
  MoveCheckState,
  ParsedAudit,
  TrendContextEntry,
} from "../../types/index.js";
import { callAudit, consumeLastAuditLogId, reportAuditLogOutcome, streamAudit } from "../api.js";
import { BADGE_DEFINITIONS, evaluateBadges } from "../badges.js";
import { computeStreak, getISOWeekNum } from "../dateHelpers.js";
import { generateStrategy, mergeSnapshotDebts } from "../engine.js";
import { haptic } from "../haptics.js";
import { log } from "../logger.js";
import { addMilestones, extractAuditMilestones, getMemoryBlock, loadMemory } from "../memory.js";
import { isLikelyAbortError, toUserFacingRequestError } from "../networkErrors.js";
import { getProvider } from "../providers.js";
import { buildScrubber } from "../scrubber.js";
import { getHistoryLimit, getOrCreateDeviceId, recordAuditUsage } from "../subscription.js";
import { useToast } from "../Toast.js";
import { buildDegradedParsedAudit, cyrb53, db, detectAuditDrift, parseAudit, validateParsedAuditConsistency } from "../utils.js";
import { useNavigation } from "./NavigationContext.js";
import { usePortfolio } from "./PortfolioContext.js";
import { useSettings } from "./SettingsContext.js";
import {
  buildContributionAutoUpdates,
  hasCompletedAuditForSession,
  migrateHistory,
  scrubPromptContext,
  type AuditDraftRecord,
} from "./auditHelpers.js";

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
  abortActiveAudit: (reason?: string) => void;
  clearAll: () => Promise<void>;
  factoryReset: () => Promise<void>;
  deleteHistoryItem: (auditToDelete: AuditRecord) => void;
  isAuditReady: boolean;
  handleManualImport: (resultText: string) => Promise<void>;
  isTest: boolean;
  historyLimit: number;
  recoverableAuditDraft: AuditDraftRecord | null;
  activeAuditDraftView: AuditDraftRecord | null;
  checkRecoverableAuditDraft: () => Promise<AuditDraftRecord | null>;
  openRecoverableAuditDraft: () => void;
  dismissRecoverableAuditDraft: () => Promise<void>;
  rehydrateAudit: () => Promise<void>;
  quota?: unknown;
}

const AuditContext = createContext<AuditContextValue | null>(null);

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
    setAiModel,
  } = useSettings();

  const { cards, renewals, cardAnnualFees, setBadges } = usePortfolio();
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
  const [recoverableAuditDraft, setRecoverableAuditDraft] = useState<AuditDraftRecord | null>(null);
  const [activeAuditDraftView, setActiveAuditDraftView] = useState<AuditDraftRecord | null>(null);
  const toast = useToast() as ToastApi;
  const [isAuditReady, setIsAuditReady] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeAuditSessionTsRef = useRef<string | null>(null);
  const auditRawRef = useRef<string>("");
  const auditAbortReasonRef = useRef<string | null>(null);

  useEffect(() => {
    getHistoryLimit()
      .then((limit: number) => setHistoryLimit(limit))
      .catch(() => setHistoryLimit(Infinity));
  }, []);

  const rehydrateAudit = useCallback(async (): Promise<void> => {
    try {
      setCurrent(null);
      setHistory([]);
      setMoveChecks({});
      setError(null);
      setUseStreaming(true);
      setStreamText("");
      setElapsed(0);
      setViewing(null);
      setTrendContext([]);
      setInstructionHash(null);
      setRecoverableAuditDraft(null);
      setActiveAuditDraftView(null);

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
      const migratedHistory =
        migrateHistory(hist, async (nextHistory) => {
          await db.set("audit-history", nextHistory);
        }) || [];

      if (hist) setHistory(migratedHistory);
      if (moves) setMoveChecks(moves);
      if (cur) setCurrent(cur);
      if (streamingMode !== null) setUseStreaming(streamingMode);
      if (instHash) setInstructionHash(instHash);
      if (savedTrend) setTrendContext(savedTrend);
      const storedDraft = (await db.get("audit-draft")) as AuditDraftRecord | null;
      const completedForSession = hasCompletedAuditForSession(storedDraft, cur, migratedHistory);
      if (storedDraft?.sessionTs && storedDraft.raw?.trim() && !completedForSession) {
        setRecoverableAuditDraft(storedDraft);
      } else if (storedDraft) {
        await db.del("audit-draft");
      }
    } catch (initError: unknown) {
      log.error("audit", "Audit context init error", { error: initError });
    }
  }, []);

  useEffect(() => {
    const initAudit = async (): Promise<void> => {
      try {
        await rehydrateAudit();
      } finally {
        setIsAuditReady(true);
      }
    };
    void initAudit();
  }, [rehydrateAudit]);

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const persistAuditDraft = useCallback(async (draft: AuditDraftRecord | null): Promise<void> => {
    if (!draft || !draft.sessionTs || !draft.raw?.trim()) return;
    await db.set("audit-draft", draft);
    setRecoverableAuditDraft(draft);
  }, []);

  const clearAuditDraft = useCallback(async (): Promise<void> => {
    await db.del("audit-draft");
    setRecoverableAuditDraft(null);
    setActiveAuditDraftView(null);
  }, []);

  const checkRecoverableAuditDraft = useCallback(async (): Promise<AuditDraftRecord | null> => {
    const storedDraft = (await db.get("audit-draft")) as AuditDraftRecord | null;
    if (!storedDraft?.sessionTs || !storedDraft?.raw?.trim()) {
      setRecoverableAuditDraft(null);
      return null;
    }

    if (hasCompletedAuditForSession(storedDraft, current, history)) {
      await db.del("audit-draft");
      setRecoverableAuditDraft(null);
      return null;
    }

    setRecoverableAuditDraft(storedDraft);
    return storedDraft;
  }, [current, history]);

  const openRecoverableAuditDraft = useCallback((): void => {
    if (!recoverableAuditDraft) return;
    setActiveAuditDraftView(recoverableAuditDraft);
    setStreamText(recoverableAuditDraft.raw);
    setError("Recovered interrupted audit draft. Review the partial output, then rerun the audit if needed.");
  }, [recoverableAuditDraft]);

  const dismissRecoverableAuditDraft = useCallback(async (): Promise<void> => {
    await clearAuditDraft();
  }, [clearAuditDraft]);

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
      setActiveAuditDraftView(null);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
      const controller = new AbortController();
      abortRef.current = controller;
      const auditSessionTs = new Date().toISOString();
      activeAuditSessionTsRef.current = auditSessionTs;
      auditRawRef.current = "";
      auditAbortReasonRef.current = null;

      let nextHistory: AuditRecord[];

      try {
        let raw = "";
        let computedStrategy: ReturnType<typeof generateStrategy> | null = null;
        let promptRenewals: typeof renewals = [...renewals, ...cardAnnualFees];
        let strategyCards = cards;
        let scrubber: { scrub: (input: string) => string; unscrub: (input: string) => string } | null = null;
        let historyForProvider: Array<{ role: string; content: string } | { role: string; parts: Array<{ text: string }> }> = [];
        let deviceId: string | null = null;

        if (manualResultText) {
          raw = manualResultText;
          auditRawRef.current = raw;
          setStreamText(raw);
        } else {
          const useStream = useStreaming && !!provider.supportsStreaming;
          promptRenewals = [...renewals, ...cardAnnualFees];

          strategyCards = mergeSnapshotDebts(cards || [], (formData?.debts || []) as never[], financialConfig?.defaultAPR || 0) as typeof cards;
          computedStrategy = generateStrategy(financialConfig, {
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

          scrubber = buildScrubber(cards, promptRenewals, financialConfig, formData) as {
            scrub: (input: string) => string;
            unscrub: (input: string) => string;
          };

          const memory = (await loadMemory().catch(() => ({ facts: [], milestones: [] }))) as {
            facts: unknown[];
            milestones: unknown[];
          };
          const memBlock = getMemoryBlock(memory);

          const activeScrubber = scrubber;
          const liveContext = scrubPromptContext(
            {
              providerId: aiProvider || "gemini",
              financialConfig,
              cards,
              renewals: promptRenewals,
              personalRules: personalRules || "",
              trendContext,
              persona,
              computedStrategy,
              chatContext,
              memoryBlock: memBlock,
              aiConsent,
            },
            activeScrubber.scrub
          );
          const liveHash = cyrb53(JSON.stringify(liveContext)).toString();
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

          historyForProvider =
            aiProvider === "gemini"
              ? apiHistory.map((message) => ({
                  role: message.role === "assistant" ? "model" : "user",
                  parts: [{ text: activeScrubber.scrub(message.content) }],
                }))
              : apiHistory.map((message) => ({ ...message, content: activeScrubber.scrub(message.content) }));

          const scrubbedMsg = activeScrubber.scrub(msg);
          deviceId = await getOrCreateDeviceId();
          if (useStream) {
            for await (const chunk of streamAudit(
              trimmedApiKey,
              scrubbedMsg,
              aiProvider,
              aiModel,
              liveContext,
              historyForProvider,
              deviceId,
              controller.signal
            )) {
              raw += chunk;
              auditRawRef.current = raw;
              setStreamText(activeScrubber.unscrub(raw));
            }
          } else {
            raw = (await callAudit(
              trimmedApiKey,
              scrubbedMsg,
              aiProvider,
              aiModel,
              liveContext,
              historyForProvider,
              deviceId
            )) as string;
            auditRawRef.current = raw;
          }

          raw = activeScrubber.unscrub(raw);
          auditRawRef.current = raw;
          const newApiHistory = [...apiHistory, { role: "user", content: msg }, { role: "assistant", content: raw }];
          await db.set(historyKey, newApiHistory.slice(-8));
        }

        let parsed = parseAudit(raw) as ParsedAudit | null;
        const primaryAuditLogId = consumeLastAuditLogId();
        let retryAuditLogId: string | null = null;
        let hitDegradedFallback = false;

        if (!parsed && !manualResultText && computedStrategy && scrubber && deviceId) {
          log.warn("audit", "Primary parse failed; retrying with critical-field prompt");
          await reportAuditLogOutcome(primaryAuditLogId, false, false);
          const retryRaw = await callAudit(
            trimmedApiKey,
            scrubber.scrub(msg),
            aiProvider,
            aiModel,
            scrubPromptContext(
              {
                variant: "critical-retry",
                financialConfig,
                computedStrategy,
                formData,
                aiConsent,
              },
              scrubber.scrub
            ),
            [],
            deviceId
          );
          raw = scrubber.unscrub(String(retryRaw || ""));
          setStreamText(raw);
          retryAuditLogId = consumeLastAuditLogId();
          parsed = parseAudit(raw) as ParsedAudit | null;
        }

        if (!parsed && !manualResultText && computedStrategy) {
          hitDegradedFallback = true;
          parsed = buildDegradedParsedAudit({
            raw,
            reason: "Full AI narrative unavailable — showing deterministic engine signals only.",
            retryAttempted: true,
            computedStrategy,
            financialConfig,
            formData,
            renewals: promptRenewals,
            cards: strategyCards,
          }) as ParsedAudit;
        }

        if (!parsed) {
          await reportAuditLogOutcome(retryAuditLogId || primaryAuditLogId, false, false, {
            confidence: "low",
          });
          throw new Error("Model output was not valid audit JSON. Please retry.");
        }
        parsed = validateParsedAuditConsistency(parsed, {
          operationalSurplus: computedStrategy?.operationalSurplus ?? null,
          nativeScore: computedStrategy?.auditSignals?.nativeScore?.score ?? null,
          nativeRiskFlags: computedStrategy?.auditSignals?.riskFlags ?? [],
        }) as ParsedAudit;
        const previousComparableAudit = history.find((audit) => {
          if (!audit?.ts || audit.isTest) return false;
          const ageMs = Date.now() - Date.parse(audit.ts);
          return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
        }) || null;
        const drift = detectAuditDrift(previousComparableAudit?.parsed || null, parsed);
        const nativeScoreDelta =
          parsed?.consistency?.nativeScoreAnchor != null
            ? Math.abs(Number(parsed?.consistency?.nativeScoreDelta || 0))
            : null;
        const confidence =
          nativeScoreDelta == null ? "medium" : nativeScoreDelta > 5 ? "low" : nativeScoreDelta <= 2 ? "high" : "medium";
        await reportAuditLogOutcome(retryAuditLogId || primaryAuditLogId, !hitDegradedFallback, hitDegradedFallback, {
          driftWarning: drift.driftDetected,
          driftDetails: drift.reasons,
          confidence,
        });

        const audit: AuditRecord = {
          date: formData.date,
          ts: auditSessionTs,
          form: formData,
          parsed,
          isTest: testMode,
          moveChecks: {},
        };
        await clearAuditDraft();

        if (testMode) {
          setViewing(audit);
          nextHistory = [audit, ...history].slice(0, 52);
          setHistory(nextHistory);
          await db.set("audit-history", nextHistory);
        } else {
          if (parsed.mode !== "DEGRADED") {
            const contributionUpdates = buildContributionAutoUpdates(parsed, raw, financialConfig);
            if (contributionUpdates) {
              setFinancialConfig((prev) => ({ ...prev, ...contributionUpdates }));
            }
          }
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
        toast.success(
          testMode
            ? "Test audit complete — saved to history"
            : parsed.mode === "DEGRADED"
              ? "Audit completed with deterministic fallback"
              : "Audit complete"
        );

        if (!testMode && !manualResultText) {
          recordAuditUsage().catch(() => {});
        }

        if (!testMode) {
          let computedStreak = 0;
          try {
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
            log.error("audit", "Badge evaluation failed", { error: badgeError });
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
        // ── Per-model audit cap auto-switch (Pro only) ──
        const auditModelCap = (submitError as Record<string, unknown>)?.auditModelCapReached;
        if (auditModelCap && typeof auditModelCap === "string") {
          const AUDIT_FALLBACK: Record<string, string> = {
            "gpt-4.1": "gemini-2.5-flash",
            "gemini-2.5-flash": "gpt-4.1",
          };
          const nextModel = AUDIT_FALLBACK[auditModelCap];
          const modelNames: Record<string, string> = {
            "gemini-2.5-flash": "Catalyst AI",
            "gpt-4.1": "Catalyst AI CFO",
          };
          if (nextModel) {
            (setAiModel as (m: string) => void)(nextModel);
            setError(`Monthly ${modelNames[auditModelCap] || auditModelCap} audit limit reached. Switched to ${modelNames[nextModel] || nextModel} — run your audit again.`);
            toast.error(`Switched to ${modelNames[nextModel] || nextModel} for audits`);
            haptic.error();
            // Stay on input — user just needs to tap Run Audit again
            setLoading(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return;
          }
        }

        const failure = toUserFacingRequestError(submitError, { context: "audit" });
        const isBackgroundAbort = auditAbortReasonRef.current === "background-pause";
        const isAbort = isBackgroundAbort || auditAbortReasonRef.current === "user-cancelled" || isLikelyAbortError(submitError);
        const partialRaw = String(auditRawRef.current || "").trim();
        if (partialRaw) {
          await persistAuditDraft({
            sessionTs: activeAuditSessionTsRef.current || auditSessionTs,
            raw: partialRaw,
            updatedAt: new Date().toISOString(),
            snapshotDate: formData.date,
            reason: auditAbortReasonRef.current || (isBackgroundAbort ? "interrupted" : failure.userMessage),
          });
        }
        if (isBackgroundAbort) {
          setError(
            "The audit was interrupted because the app went to the background. Please return to the Input tab and try again."
          );
          toast.error("Audit interrupted — app was backgrounded. Tap to retry.");
        } else if (isAbort) {
          setError("Audit was interrupted before completion. Your inputs are still here.");
          toast.error("Audit interrupted. Retry when you're ready.");
        } else {
          setError(failure.userMessage);
          toast.error(failure.userMessage || "Audit failed");
        }
        navTo("input");
        haptic.error();
      } finally {
        abortRef.current = null;
        activeAuditSessionTsRef.current = null;
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
      clearAuditDraft,
      financialConfig,
      history,
      moveChecks,
      navTo,
      persona,
      personalRules,
      persistAuditDraft,
      renewals,
      setBadges,
      setFinancialConfig,
      setShowAiConsent,
      setAiModel,
      toast,
      trendContext,
      useStreaming,
    ]
  );

  const abortActiveAudit = useCallback((reason = "interrupted"): void => {
    auditAbortReasonRef.current = reason;
    abortRef.current?.abort();
  }, []);

  const handleCancelAudit = useCallback((): void => {
    if (abortRef.current) {
      auditAbortReasonRef.current = "user-cancelled";
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
    setRecoverableAuditDraft(null);
    setActiveAuditDraftView(null);
  }, []);

  const factoryReset = useCallback(async (): Promise<void> => {
    await clearAll();
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
      const parsedAudit = parseAudit(resultText) as ParsedAudit | null;
      if (!parsedAudit) throw new Error("Imported text is not valid Catalyst Cash audit JSON.");
      const parsed = validateParsedAuditConsistency(parsedAudit) as ParsedAudit;
      if (parsed.mode !== "DEGRADED") {
        const contributionUpdates = buildContributionAutoUpdates(parsed, resultText, financialConfig);
        if (contributionUpdates) {
          setFinancialConfig((prev) => ({ ...prev, ...contributionUpdates }));
        }
      }
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
      await clearAuditDraft();
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
  }, [clearAuditDraft, financialConfig, navTo, setFinancialConfig, setResultsBackTarget, toast]);

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
    abortActiveAudit,
    clearAll,
    factoryReset,
    deleteHistoryItem,
    isAuditReady,
    handleManualImport,
    isTest,
    historyLimit,
    recoverableAuditDraft,
    activeAuditDraftView,
    checkRecoverableAuditDraft,
    openRecoverableAuditDraft,
    dismissRecoverableAuditDraft,
    rehydrateAudit,
  };

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export const useAudit = (): AuditContextValue => {
  const context = useContext(AuditContext);
  if (!context) throw new Error("useAudit must be used within an AuditProvider");
  return context;
};
