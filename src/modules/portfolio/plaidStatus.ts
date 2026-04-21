import {
  formatPlaidSyncDateShort,
  parsePlaidSyncTimestamp,
  PLAID_STALE_SYNC_THRESHOLD_MS,
} from "../usePlaidSync.js";

export interface PlaidLinkedStatusItem {
  _plaidConnectionId?: string | null;
  _plaidLastSync?: string | number | Date | null;
  institution?: string | null;
  bank?: string | null;
  name?: string | null;
}

export interface PlaidStaleInstitution {
  connectionId: string;
  name: string;
  lastSyncAt: number;
}

export interface PlaidStaleBreakdown {
  reconnectRequired: PlaidStaleInstitution[];
  connectedButCached: PlaidStaleInstitution[];
}

export interface PlaidSyncIssueInput {
  institutionName?: string;
  message?: string;
}

export interface PlaidGroupedSyncIssue {
  institutionName: string;
  institutionNames: string[];
  message: string;
  issueCount: number;
  cachedSnapshots: string[];
}

function getInstitutionLabel(item: PlaidLinkedStatusItem): string {
  return String(item?.institution || item?.bank || item?.name || "Linked institution").trim();
}

function extractCachedSnapshotLabel(message = ""): string | null {
  const match = String(message).match(/cached balances from (.+?)(?=\.|$)/i);
  const label = String(match?.[1] || "").trim();
  return label || null;
}

function normalizePlaidSyncIssue(message = "") {
  const cleaned = String(message).replace(/\s+/g, " ").trim() || "Needs attention.";
  const needsReconnect = /reconnect/i.test(cleaned);
  const processing = /processing/i.test(cleaned);
  const waitingForLiveSync = /next live sync/i.test(cleaned);
  const waitingForRefreshWindow = /next plaid refresh window/i.test(cleaned);
  const verifyBeforeActing = /verify before acting/i.test(cleaned);
  const hasCachedSnapshot = /cached balances from /i.test(cleaned);

  if (needsReconnect) {
    return {
      key: `reconnect:${verifyBeforeActing ? "verify" : "standard"}`,
      message: verifyBeforeActing
        ? "Reconnect is required in Settings before live balances can update. Verify balances before acting."
        : "Reconnect is required in Settings before live balances can update.",
    };
  }

  if (processing) {
    return {
      key: "processing",
      message: "Plaid is still processing this refresh. Fresh balances should appear on the next live sync.",
    };
  }

  if (waitingForRefreshWindow) {
    return {
      key: `cached-refresh-window:${verifyBeforeActing ? "verify" : "standard"}`,
      message: verifyBeforeActing
        ? "Cached balances are waiting for the next Plaid refresh window. Verify balances before acting."
        : "Cached balances are waiting for the next Plaid refresh window.",
    };
  }

  if (waitingForLiveSync || hasCachedSnapshot) {
    return {
      key: `cached-live-sync:${verifyBeforeActing ? "verify" : "standard"}`,
      message: verifyBeforeActing
        ? "Cached balances are waiting for the next live sync. Verify balances before acting."
        : "Cached balances are waiting for the next live sync.",
    };
  }

  return {
    key: cleaned.toLowerCase(),
    message: cleaned,
  };
}

export function getLatestPlaidSyncDate(items: PlaidLinkedStatusItem[] = []): Date | null {
  const timestamps = items
    .map((item) => parsePlaidSyncTimestamp(item?._plaidLastSync))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

export function formatPlaidSyncDateTimeLabel(value: Date | number | null): string | null {
  const date =
    value instanceof Date
      ? value
      : Number.isFinite(Number(value))
        ? new Date(Number(value))
        : null;

  if (!date || Number.isNaN(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function getStalePlaidInstitutions(
  items: PlaidLinkedStatusItem[] = [],
  thresholdMs = PLAID_STALE_SYNC_THRESHOLD_MS
): PlaidStaleInstitution[] {
  const latestSyncAt = getLatestPlaidSyncDate(items);
  if (!latestSyncAt) return [];

  const byConnection = new Map<string, PlaidStaleInstitution>();
  for (const item of items) {
    const connectionId = String(item?._plaidConnectionId || "").trim();
    if (!connectionId) continue;

    const lastSyncAt = parsePlaidSyncTimestamp(item?._plaidLastSync);
    if (!lastSyncAt) continue;

    const existing = byConnection.get(connectionId);
    if (!existing || lastSyncAt > existing.lastSyncAt) {
      byConnection.set(connectionId, {
        connectionId,
        name: getInstitutionLabel(item),
        lastSyncAt,
      });
    }
  }

  return Array.from(byConnection.values())
    .filter((entry) => (latestSyncAt.getTime() - entry.lastSyncAt) > thresholdMs)
    .sort((left, right) => left.lastSyncAt - right.lastSyncAt);
}

export function splitPlaidInstitutionsByReconnect(
  entries: PlaidStaleInstitution[] = [],
  reconnectStatus: Map<string, boolean> = new Map()
): PlaidStaleBreakdown {
  const reconnectRequired: PlaidStaleInstitution[] = [];
  const connectedButCached: PlaidStaleInstitution[] = [];

  for (const entry of entries) {
    if (reconnectStatus.get(String(entry.connectionId || "").trim()) === true) {
      reconnectRequired.push(entry);
    } else {
      connectedButCached.push(entry);
    }
  }

  return { reconnectRequired, connectedButCached };
}

function summarizeEntries(
  entries: PlaidStaleInstitution[] = [],
  mapLabel: (entry: PlaidStaleInstitution) => string,
  maxEntries = 2
): string | null {
  if (!entries.length) return null;
  const preview = entries.slice(0, maxEntries).map(mapLabel).join(", ");
  return entries.length > maxEntries ? `${preview}, and others` : preview;
}

export function summarizeConnectedButCached(
  entries: PlaidStaleInstitution[] = [],
  maxEntries = 2
): string | null {
  return summarizeEntries(
    entries,
    (entry) => `${entry.name} (${formatPlaidSyncDateShort(entry.lastSyncAt) || "cached"})`,
    maxEntries
  );
}

export function summarizeReconnectRequired(
  entries: PlaidStaleInstitution[] = [],
  maxEntries = 2
): string | null {
  return summarizeEntries(entries, (entry) => entry.name, maxEntries);
}

export function groupPlaidSyncIssues(issues: PlaidSyncIssueInput[] = []): PlaidGroupedSyncIssue[] {
  const grouped = new Map<
    string,
    {
      message: string;
      institutionNames: string[];
      cachedSnapshots: string[];
    }
  >();

  for (const issue of issues) {
    const institutionName = String(issue?.institutionName || "Linked institution").trim() || "Linked institution";
    const normalized = normalizePlaidSyncIssue(issue?.message || "");
    const snapshotLabel = extractCachedSnapshotLabel(issue?.message || "");
    const existing = grouped.get(normalized.key);

    if (existing) {
      if (!existing.institutionNames.includes(institutionName)) {
        existing.institutionNames.push(institutionName);
      }
      if (snapshotLabel) {
        const snapshotEntry = `${institutionName} (${snapshotLabel})`;
        if (!existing.cachedSnapshots.includes(snapshotEntry)) {
          existing.cachedSnapshots.push(snapshotEntry);
        }
      }
      continue;
    }

    grouped.set(normalized.key, {
      message: normalized.message,
      institutionNames: [institutionName],
      cachedSnapshots: snapshotLabel ? [`${institutionName} (${snapshotLabel})`] : [],
    });
  }

  return Array.from(grouped.values()).map((group) => {
    const preview = group.institutionNames.slice(0, 2).join(", ");
    const extraCount = Math.max(group.institutionNames.length - 2, 0);
    return {
      institutionName: extraCount > 0 ? `${preview} +${extraCount}` : preview,
      institutionNames: group.institutionNames,
      message: group.message,
      issueCount: group.institutionNames.length,
      cachedSnapshots: group.cachedSnapshots,
    };
  });
}
