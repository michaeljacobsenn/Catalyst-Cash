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

function getInstitutionLabel(item: PlaidLinkedStatusItem): string {
  return String(item?.institution || item?.bank || item?.name || "Linked institution").trim();
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
