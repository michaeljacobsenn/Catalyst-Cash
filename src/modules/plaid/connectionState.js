import { log } from "../logger.js";
import { getSubscriptionState, INSTITUTION_LIMITS, isGatingEnforced } from "../subscription.js";
import { db } from "../utils.js";

const PLAID_STORAGE_KEY = "plaid-connections";
const PLAID_FREE_ACTIVE_CONNECTION_KEY = "plaid-free-active-connection-id";
const PLAID_FREE_ACTIVE_CONNECTION_CHANGED_AT_KEY = "plaid-free-active-connection-changed-at";

export const PLAID_MANUAL_SYNC_COOLDOWNS = {
  free: 7 * 24 * 60 * 60 * 1000,
  pro: 24 * 60 * 60 * 1000,
};

export const FREE_PLAID_CONNECTION_SWITCH_COOLDOWN_MS = PLAID_MANUAL_SYNC_COOLDOWNS.free;

function sanitizeConnectionForStorage(connection = {}) {
  const { accessToken: _accessToken, ...rest } = connection;
  return {
    ...rest,
    accounts: (connection.accounts || []).map((account) => ({ ...account })),
  };
}

export async function getConnections() {
  const stored = (await db.get(PLAID_STORAGE_KEY)) || [];
  if (!Array.isArray(stored) || stored.length === 0) return [];

  const sanitized = stored.map(sanitizeConnectionForStorage);
  const uniqueConns = [];
  const seenIds = new Set();
  let deduplicated = false;

  for (let index = sanitized.length - 1; index >= 0; index -= 1) {
    const connection = sanitized[index];
    if (connection.id && seenIds.has(connection.id)) {
      deduplicated = true;
      continue;
    }
    if (connection.id) seenIds.add(connection.id);
    uniqueConns.unshift(connection);
  }

  const hasLegacyTokens = stored.some((connection) => connection && "accessToken" in connection);
  if (deduplicated || hasLegacyTokens) {
    if (deduplicated) void log.warn("plaid", "Cleaned up duplicate connections from local storage.");
    if (hasLegacyTokens) void log.warn("plaid", "Removed legacy access tokens from local connection storage.");
    await db.set(PLAID_STORAGE_KEY, uniqueConns);
  }

  return uniqueConns;
}

export async function saveConnections(connections) {
  await db.set(PLAID_STORAGE_KEY, (connections || []).map(sanitizeConnectionForStorage));
}

function sortConnectionsForPriority(connections = []) {
  return [...connections].sort((left, right) => {
    const leftReconnect = left?._needsReconnect ? 1 : 0;
    const rightReconnect = right?._needsReconnect ? 1 : 0;
    if (leftReconnect !== rightReconnect) return leftReconnect - rightReconnect;

    const leftLastSync = left?.lastSync ? new Date(left.lastSync).getTime() : 0;
    const rightLastSync = right?.lastSync ? new Date(right.lastSync).getTime() : 0;
    if (leftLastSync !== rightLastSync) return rightLastSync - leftLastSync;

    return String(left?.institutionName || "").localeCompare(String(right?.institutionName || ""));
  });
}

function choosePreferredFreeConnectionId(connections = [], preferredId = null) {
  const viableConnections = sortConnectionsForPriority((connections || []).filter((connection) => connection?.id));
  if (viableConnections.length === 0) return null;

  if (preferredId && viableConnections.some((connection) => connection.id === preferredId)) {
    return preferredId;
  }

  return viableConnections[0]?.id || null;
}

export function getPreferredFreeConnectionSwitchCooldownRemaining(lastChangedAt, now = Date.now()) {
  if (!lastChangedAt) return 0;
  const changedAtMs = new Date(lastChangedAt).getTime();
  if (!Number.isFinite(changedAtMs)) return 0;
  return Math.max(0, FREE_PLAID_CONNECTION_SWITCH_COOLDOWN_MS - (now - changedAtMs));
}

export function shouldEnforcePreferredFreeConnectionSwitchCooldown({
  gatingEnforced = false,
  tier = "free",
  connectionCount = 0,
  limit = INSTITUTION_LIMITS.free,
} = {}) {
  return Boolean(gatingEnforced && tier === "free" && Number.isFinite(limit) && connectionCount > limit);
}

function formatPlaidCooldownDuration(ms) {
  const minsLeft = Math.max(1, Math.ceil(ms / 60000));
  const hoursLeft = Math.floor(minsLeft / 60);
  const daysLeft = Math.floor(hoursLeft / 24);

  if (daysLeft > 0) {
    return `${daysLeft} day${daysLeft > 1 ? "s" : ""} ${hoursLeft % 24}h`;
  }
  if (hoursLeft > 0) {
    return `${hoursLeft}h ${minsLeft % 60}m`;
  }
  return `${minsLeft} min`;
}

async function getPreferredFreeConnectionChangedAt() {
  return (await db.get(PLAID_FREE_ACTIVE_CONNECTION_CHANGED_AT_KEY)) || null;
}

export async function getPreferredFreeConnectionId() {
  return (await db.get(PLAID_FREE_ACTIVE_CONNECTION_KEY)) || null;
}

export async function setPreferredFreeConnectionId(connectionId, options = {}) {
  const force = options.force === true;
  const normalizedId = String(connectionId || "").trim() || null;
  const currentId = await getPreferredFreeConnectionId();

  if (!force && normalizedId && currentId && normalizedId !== currentId) {
    const subscriptionState = await getSubscriptionState();
    const connections = await getConnections();
    const shouldEnforceCooldown = shouldEnforcePreferredFreeConnectionSwitchCooldown({
      gatingEnforced: isGatingEnforced(),
      tier: subscriptionState?.tier || "free",
      connectionCount: connections.length,
      limit: INSTITUTION_LIMITS[subscriptionState?.tier] || INSTITUTION_LIMITS.free,
    });

    if (shouldEnforceCooldown) {
      const lastChangedAt = await getPreferredFreeConnectionChangedAt();
      const remainingMs = getPreferredFreeConnectionSwitchCooldownRemaining(lastChangedAt);
      if (remainingMs > 0) {
        throw new Error(`You can switch your active live bank again in ${formatPlaidCooldownDuration(remainingMs)}.`);
      }
    }
  }

  await db.set(PLAID_FREE_ACTIVE_CONNECTION_KEY, normalizedId);

  if (!normalizedId) {
    await db.del(PLAID_FREE_ACTIVE_CONNECTION_CHANGED_AT_KEY);
  } else if (!force && normalizedId !== currentId) {
    await db.set(PLAID_FREE_ACTIVE_CONNECTION_CHANGED_AT_KEY, new Date().toISOString());
  }

  return normalizedId;
}

export function resolvePlaidConnectionAccessState(
  connections = [],
  {
    gatingEnforced = false,
    tier = "free",
    limit = INSTITUTION_LIMITS.free,
    preferredId = null,
  } = {}
) {
  const activeConnectionId =
    gatingEnforced && tier === "free" ? choosePreferredFreeConnectionId(connections, preferredId) : null;

  const nextConnections = connections.map((connection) => {
    const shouldPause =
      gatingEnforced &&
      tier === "free" &&
      limit !== Infinity &&
      connections.length > limit &&
      connection?.id &&
      connection.id !== activeConnectionId;

    return {
      ...connection,
      _freeTierPaused: shouldPause,
    };
  });

  const pausedConnectionIds = nextConnections
    .filter((connection) => connection?._freeTierPaused)
    .map((connection) => String(connection.id || "").trim())
    .filter(Boolean);

  const syncableConnections = nextConnections.filter((connection) => !connection?._freeTierPaused);
  const syncableConnectionIds = syncableConnections
    .map((connection) => String(connection.id || "").trim())
    .filter(Boolean);

  return {
    nextConnections,
    pausedConnectionIds,
    syncableConnections,
    syncableConnectionIds,
    activeFreeConnectionId:
      gatingEnforced && tier === "free" && activeConnectionId ? activeConnectionId : null,
    connectionsChanged:
      nextConnections.length !== connections.length ||
      nextConnections.some(
        (connection, index) =>
          Boolean(connection?._freeTierPaused) !== Boolean(connections[index]?._freeTierPaused)
      ),
  };
}
