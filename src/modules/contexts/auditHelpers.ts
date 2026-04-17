import type { AuditRecord, ParsedAudit } from "../../types/index.js";

export interface AuditDraftRecord {
  sessionTs: string;
  raw: string;
  updatedAt: string;
  snapshotDate?: string | null;
  reason?: string | null;
  promptSurfacedAt?: string | null;
}

interface ContributionConfig {
  trackRothContributions?: boolean;
  track401k?: boolean;
  autoTrackRothYTD?: boolean;
  autoTrack401kYTD?: boolean;
  rothContributedYTD?: number;
  k401ContributedYTD?: number;
  rothAnnualLimit?: number;
  k401AnnualLimit?: number;
}

export function migrateHistory(
  historyItems: AuditRecord[] | null,
  persist?: (nextHistory: AuditRecord[]) => void | Promise<void>
): AuditRecord[] | null {
  if (!historyItems?.length) return historyItems;
  let migrated = false;
  const result = historyItems.map((audit) => {
    if (!audit.moveChecks) {
      migrated = true;
      return { ...audit, moveChecks: {} };
    }
    return audit;
  });
  if (migrated) {
    void persist?.(result);
  }
  return result;
}

export function scrubPromptContext<T>(value: T, scrub: (input: string) => string): T {
  if (typeof value === "string") return scrub(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrubPromptContext(item, scrub)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, scrubPromptContext(entry, scrub)])
    ) as T;
  }
  return value;
}

export function hasCompletedAuditForSession(
  storedDraft: AuditDraftRecord | null,
  current: AuditRecord | null,
  history: AuditRecord[]
): boolean {
  if (!storedDraft?.sessionTs) return false;
  return current?.ts === storedDraft.sessionTs || history.some((audit) => audit.ts === storedDraft.sessionTs);
}

function getAuditRecordFingerprint(audit: AuditRecord | null | undefined): string {
  if (!audit) return "";
  const ts = String(audit.ts || "").trim();
  if (ts) return `ts:${ts}`;
  return JSON.stringify({
    date: audit.date || audit.form?.date || "",
    score: audit.parsed?.healthScore?.score ?? null,
    grade: audit.parsed?.healthScore?.grade ?? "",
    netWorth: audit.parsed?.netWorth ?? null,
    status: audit.parsed?.status ?? "",
    mode: audit.parsed?.mode ?? "",
    model: audit.model ?? "",
    isTest: audit.isTest ?? false,
  });
}

export function matchesAuditRecord(left: AuditRecord | null | undefined, right: AuditRecord | null | undefined): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTs = String(left.ts || "").trim();
  const rightTs = String(right.ts || "").trim();
  if (leftTs && rightTs) return leftTs === rightTs;
  if (leftTs || rightTs) return false;
  return getAuditRecordFingerprint(left) === getAuditRecordFingerprint(right);
}

export function removeAuditRecord(history: AuditRecord[] = [], auditToRemove: AuditRecord | null | undefined): AuditRecord[] {
  if (!auditToRemove) return history;
  let removed = false;
  return history.filter((audit) => {
    if (!removed && matchesAuditRecord(audit, auditToRemove)) {
      removed = true;
      return false;
    }
    return true;
  });
}

function extractAmount(text: string): number {
  const match = text.match(/\$([\d,]+(?:\.\d{2})?)/);
  const amount = match?.[1];
  return amount ? parseFloat(amount.replace(/,/g, "")) : 0;
}

function scanContributionMoves(moves: Array<string | { text?: string; description?: string }>) {
  let rothDelta = 0;
  let k401Delta = 0;
  moves.forEach((move) => {
    const text = (typeof move === "string" ? move : move.text || move.description || "").toString();
    if (/roth/i.test(text)) rothDelta = Math.max(rothDelta, extractAmount(text));
    if (/401k|401 k/i.test(text)) k401Delta = Math.max(k401Delta, extractAmount(text));
  });
  return { rothDelta, k401Delta };
}

export function buildContributionAutoUpdates(
  parsed: ParsedAudit | null,
  rawText: string,
  financialConfig: ContributionConfig | null | undefined
): Partial<ContributionConfig> | null {
  if (!parsed || !financialConfig) return null;
  if (!financialConfig.trackRothContributions && !financialConfig.track401k) return null;

  const structuredMoves = parsed.structured?.moves;
  const moveSource =
    Array.isArray(structuredMoves) && structuredMoves.length
      ? structuredMoves
      : parsed.moveItems?.length
        ? parsed.moveItems
        : parsed.sections?.moves
          ? parsed.sections.moves.split("\n")
          : rawText
            ? rawText.split("\n")
            : [];

  const { rothDelta, k401Delta } = scanContributionMoves(moveSource as Array<string | { text?: string; description?: string }>);
  const next: Partial<ContributionConfig> = {};

  if (financialConfig.trackRothContributions && financialConfig.autoTrackRothYTD !== false && rothDelta > 0) {
    const nextRoth = Math.max(0, (financialConfig.rothContributedYTD || 0) + rothDelta);
    next.rothContributedYTD = financialConfig.rothAnnualLimit
      ? Math.min(nextRoth, financialConfig.rothAnnualLimit)
      : nextRoth;
  }

  if (financialConfig.track401k && financialConfig.autoTrack401kYTD !== false && k401Delta > 0) {
    const next401k = Math.max(0, (financialConfig.k401ContributedYTD || 0) + k401Delta);
    next.k401ContributedYTD = financialConfig.k401AnnualLimit
      ? Math.min(next401k, financialConfig.k401AnnualLimit)
      : next401k;
  }

  return Object.keys(next).length ? next : null;
}
