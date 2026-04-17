// ═══════════════════════════════════════════════════════════════
// backup.js — Export & Import backup logic
// Extracted from SettingsTab.jsx for clarity and testability.
// ═══════════════════════════════════════════════════════════════
import { APP_VERSION } from "./constants.js";
import {
  clearBackupMetadata,
  LAST_CLOUD_BACKUP_TS_KEY,
  markCloudBackup,
  markPortableBackup,
} from "./backupMetadata.js";
import { normalizeBudgetLines } from "./budgetBuckets.js";
import { decrypt, encrypt, isEncrypted } from "./crypto.js";
import { ensureConnectionAccountsPresent, materializeManualFallbackForConnections } from "./plaid.js";
import { sanitizeManualInvestmentHoldings } from "./investmentHoldings.js";
import { FULL_PROFILE_QA_ACTIVE_KEY, shouldRecoverFromFullProfileQaSeed } from "./qaSeed.js";
import { relinkRenewalPaymentMethods } from "./renewalPaymentLinking.js";
import { isSafeImportKey, isSecuritySensitiveKey, sanitizePlaidForBackup } from "./securityKeys.js";
import { db } from "./utils.js";

async function loadWorkbookClientModule() {
  return import("./excelWorkbookClient.js");
}

async function loadNativeExportModule() {
  return import("./nativeExport.js");
}

const SUPPORTED_BACKUP_EXTENSIONS = [".enc", ".json"];
const SUPPORTED_BACKUP_MIME_TYPES = new Set([
  "application/json",
  "application/octet-stream",
  "text/plain",
  "",
]);

export function isSupportedBackupFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return (
    SUPPORTED_BACKUP_EXTENSIONS.some(extension => name.endsWith(extension)) ||
    SUPPORTED_BACKUP_MIME_TYPES.has(type)
  );
}

/**
 * Merge two arrays of objects with unique `id` fields, keeping existing entries.
 */
export function mergeUniqueById(existing = [], incoming = []) {
  if (!incoming.length) return existing;
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function toLocalDayKey(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shouldRunAutoBackup(interval, lastBackupTs, now = Date.now()) {
  if (!interval || interval === "off") return false;
  const lastTs = Number(lastBackupTs) || 0;
  if (!lastTs) return true;

  if (interval === "daily") {
    return toLocalDayKey(lastTs) !== toLocalDayKey(now);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const requiredDeltaMs =
    interval === "weekly" ? dayMs * 7
      : interval === "monthly" ? dayMs * 30
        : dayMs;

  return now - lastTs >= requiredDeltaMs;
}

function isDemoCard(card) {
  return String(card?.id || "").startsWith("demo-card-");
}

function isDemoBankAccount(account) {
  return String(account?.id || "").startsWith("demo-");
}

function isDemoRenewal(renewal) {
  return String(renewal?.id || "").startsWith("demo-ren-");
}

export function sanitizeBackupPortfolioData({
  cards = [],
  bankAccounts = [],
  renewals = [],
} = {}) {
  const sanitizedCards = Array.isArray(cards) ? cards.filter(card => !isDemoCard(card)) : [];
  const sanitizedBankAccounts = Array.isArray(bankAccounts) ? bankAccounts.filter(account => !isDemoBankAccount(account)) : [];
  const sanitizedRenewals = Array.isArray(renewals) ? renewals.filter(renewal => !isDemoRenewal(renewal)) : [];
  const relinkedRenewals = relinkRenewalPaymentMethods(sanitizedRenewals, sanitizedCards, sanitizedBankAccounts).renewals;

  return {
    cards: sanitizedCards,
    bankAccounts: sanitizedBankAccounts,
    renewals: relinkedRenewals,
  };
}

export async function restoreSanitizedPlaidConnections(sanitizedPlaid = []) {
  if (!Array.isArray(sanitizedPlaid) || sanitizedPlaid.length === 0) {
    return {
      reconnectCount: 0,
      placeholderCardCount: 0,
      placeholderBankAccountCount: 0,
      placeholderInvestmentCount: 0,
      relinkedRenewalCount: 0,
    };
  }

  const existingConnections = (await db.get("plaid-connections")) || [];
  const existingIds = new Set(existingConnections.map((connection) => String(connection?.id || "").trim()).filter(Boolean));
  const mergedConnections = [...existingConnections];
  let reconnectCount = 0;

  for (const connection of sanitizedPlaid) {
    if (
      typeof connection === "object" &&
      connection !== null &&
      "id" in connection &&
      typeof connection.id === "string" &&
      !existingIds.has(connection.id)
    ) {
      mergedConnections.push({ ...connection, _needsReconnect: true });
      reconnectCount++;
    }
  }

  await db.set("plaid-connections", mergedConnections);

  const reconnectConnections = mergedConnections.filter(
    (connection) => connection?._needsReconnect && Array.isArray(connection.accounts) && connection.accounts.length > 0
  );
  if (reconnectConnections.length === 0) {
    return {
      reconnectCount,
      placeholderCardCount: 0,
      placeholderBankAccountCount: 0,
      placeholderInvestmentCount: 0,
      relinkedRenewalCount: 0,
    };
  }

  let cards = (await db.get("card-portfolio")) || [];
  let bankAccounts = (await db.get("bank-accounts")) || [];
  const financialConfig = ((await db.get("financial-config")) || {});
  let plaidInvestments = Array.isArray(financialConfig.plaidInvestments) ? financialConfig.plaidInvestments : [];
  let placeholderCardCount = 0;
  let placeholderBankAccountCount = 0;
  let placeholderInvestmentCount = 0;

  for (const connection of reconnectConnections) {
    const hydrated = ensureConnectionAccountsPresent(
      connection,
      cards,
      bankAccounts,
      null,
      plaidInvestments,
      { allowLikelyDuplicates: false }
    );
    cards = hydrated.updatedCards;
    bankAccounts = hydrated.updatedBankAccounts;
    plaidInvestments = hydrated.updatedPlaidInvestments;
    placeholderCardCount += hydrated.importedCards;
    placeholderBankAccountCount += hydrated.importedBankAccounts;
    placeholderInvestmentCount += hydrated.importedPlaidInvestments;
  }

  const reconnectIds = reconnectConnections
    .map((connection) => String(connection?.id || "").trim())
    .filter(Boolean);

  const fallbackState = materializeManualFallbackForConnections(cards, bankAccounts, reconnectIds, {
    keepLinkMetadata: true,
  });
  if (fallbackState.changed) {
    cards = fallbackState.updatedCards;
    bankAccounts = fallbackState.updatedBankAccounts;
  }

  await db.set("card-portfolio", cards);
  await db.set("bank-accounts", bankAccounts);
  if (placeholderInvestmentCount > 0 || Array.isArray(financialConfig.plaidInvestments)) {
    const latestFinancialConfig = ((await db.get("financial-config")) || financialConfig || {});
    await db.set("financial-config", sanitizeManualInvestmentHoldings({ ...latestFinancialConfig, plaidInvestments }));
  }

  const renewals = (await db.get("renewals")) || [];
  const relinked = relinkRenewalPaymentMethods(renewals, cards, bankAccounts);
  if (relinked.changed) {
    await db.set("renewals", relinked.renewals);
  }

  const relinkedRenewalCount = relinked.changed
    ? relinked.renewals.filter((renewal, index) => JSON.stringify(renewal) !== JSON.stringify(renewals[index])).length
    : 0;

  return {
    reconnectCount,
    placeholderCardCount,
    placeholderBankAccountCount,
    placeholderInvestmentCount,
    relinkedRenewalCount,
  };
}

export async function buildBackupPayload({ personalRules = "", exportedAt = new Date().toISOString() } = {}) {
  const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt, data: {} };

  const keys = await db.keys();
  for (const key of keys) {
    if (isSecuritySensitiveKey(key)) continue;
    const val = await db.get(key);
    if (val !== null) {
      backup.data[key] = key === "budget-lines-v2" ? normalizeBudgetLines(val).lines : val;
    }
  }

  if (!("personal-rules" in backup.data)) {
    backup.data["personal-rules"] = personalRules ?? "";
  }

  const sanitizedPortfolio = sanitizeBackupPortfolioData({
    cards: backup.data["card-portfolio"],
    bankAccounts: backup.data["bank-accounts"],
    renewals: backup.data["renewals"],
  });
  if ("card-portfolio" in backup.data) backup.data["card-portfolio"] = sanitizedPortfolio.cards;
  if ("bank-accounts" in backup.data) backup.data["bank-accounts"] = sanitizedPortfolio.bankAccounts;
  if ("renewals" in backup.data) backup.data["renewals"] = sanitizedPortfolio.renewals;

  const plaidConns = await db.get("plaid-connections");
  if (Array.isArray(plaidConns) && plaidConns.length > 0) {
    backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
  }

  return backup;
}

export async function getCloudBackupBlockReason() {
  const [cards, bankAccounts, renewals, plaidConnections, qaSeedActive] = await Promise.all([
    db.get("card-portfolio"),
    db.get("bank-accounts"),
    db.get("renewals"),
    db.get("plaid-connections"),
    db.get(FULL_PROFILE_QA_ACTIVE_KEY),
  ]);

  const shouldBlock = shouldRecoverFromFullProfileQaSeed({
    qaSeedActive: Boolean(qaSeedActive),
    cards: Array.isArray(cards) ? cards : [],
    bankAccounts: Array.isArray(bankAccounts) ? bankAccounts : [],
    renewals: Array.isArray(renewals) ? renewals : [],
    plaidConnections: Array.isArray(plaidConnections) ? plaidConnections : [],
  });

  if (!shouldBlock) return null;
  return "Cloud backup skipped because seeded QA data was detected while linked bank connections still exist.";
}

let activeCloudBackupPromise = null;

/**
 * @param {{
 *   upload: (payload: unknown, passphrase?: string | null) => Promise<boolean>;
 *   passphrase?: string | null;
 *   personalRules?: string;
 *   interval?: "off" | "daily" | "weekly" | "monthly" | null;
 *   force?: boolean;
 * }} [options]
 */
export async function performCloudBackup({
  upload,
  passphrase = null,
  personalRules = "",
  interval = null,
  force = false,
} = {}) {
  if (typeof upload !== "function") {
    throw new Error("Cloud backup upload handler is required");
  }

  if (activeCloudBackupPromise) return activeCloudBackupPromise;

  activeCloudBackupPromise = (async () => {
    if (!passphrase) {
      return { success: false, skipped: true, reason: "Encrypted iCloud backups require an App Passcode." };
    }

    const now = Date.now();
    const lastBackupTs = await db.get(LAST_CLOUD_BACKUP_TS_KEY);
    if (!force && interval && !shouldRunAutoBackup(interval, lastBackupTs, now)) {
      return { success: false, skipped: true, reason: "not-due" };
    }

    const blockReason = await getCloudBackupBlockReason();
    if (blockReason) {
      return { success: false, skipped: true, reason: blockReason };
    }

    const backup = await buildBackupPayload({ personalRules });
    const success = await upload(backup, passphrase);
    if (!success) {
      return { success: false, skipped: false, reason: "upload-failed" };
    }

    await markCloudBackup(now);
    return { success: true, skipped: false, reason: null, timestamp: now };
  })().finally(() => {
    activeCloudBackupPromise = null;
  });

  return activeCloudBackupPromise;
}

/**
 * Export a full encrypted backup of all non-sensitive db keys.
 * @param {string} passphrase - Passphrase used to encrypt the backup
 * @returns {{count: number, exportedAt: string, filename: string, plaidConnectionCount: number}} Backup metadata
 */
export async function exportBackup(passphrase) {
  const exportedAt = new Date().toISOString();
  const pr = await db.get("personal-rules");
  const backup = await buildBackupPayload({ personalRules: pr ?? "", exportedAt });
  const plaidConnectionCount = Array.isArray(backup.data["plaid-connections-sanitized"])
    ? backup.data["plaid-connections-sanitized"].length
    : 0;

  if (!passphrase) throw new Error("Backup cancelled — passphrase required");
  const envelope = await encrypt(JSON.stringify(backup), passphrase);
  const dateStr = exportedAt.split("T")[0];
  const filename = `CatalystCash_Backup_${dateStr}.enc`;
  const { nativeExport } = await loadNativeExportModule();
  await nativeExport(filename, JSON.stringify(envelope), "application/octet-stream");
  await markPortableBackup("encrypted-export", Date.parse(exportedAt) || Date.now());
  return { count: Object.keys(backup.data).length, exportedAt, filename, plaidConnectionCount };
}

export async function restoreBackupPayload(backup) {
  if (!backup?.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
    throw new Error("Invalid Catalyst Cash backup file");
  }

  const sanitizedPortfolio = sanitizeBackupPortfolioData({
    cards: backup.data["card-portfolio"],
    bankAccounts: backup.data["bank-accounts"],
    renewals: backup.data["renewals"],
  });
  if ("card-portfolio" in backup.data) backup.data["card-portfolio"] = sanitizedPortfolio.cards;
  if ("bank-accounts" in backup.data) backup.data["bank-accounts"] = sanitizedPortfolio.bankAccounts;
  if ("renewals" in backup.data) backup.data["renewals"] = sanitizedPortfolio.renewals;

  let count = 0;
  for (const [key, val] of Object.entries(backup.data)) {
    if (!isSafeImportKey(key)) continue;
    if (key === "auto-backup-interval" || key === LAST_CLOUD_BACKUP_TS_KEY) continue;
    const normalizedValue =
      key === "budget-lines-v2"
        ? normalizeBudgetLines(val).lines
        : val;
    await db.set(key, normalizedValue);
    count++;
  }
  await db.set("auto-backup-interval", "off");
  await clearBackupMetadata();

  const sanitizedPlaid = backup.data["plaid-connections-sanitized"];
  let plaidReconnectCount = 0;
  if (Array.isArray(sanitizedPlaid) && sanitizedPlaid.length > 0) {
    const restoredPlaid = await restoreSanitizedPlaidConnections(sanitizedPlaid);
    plaidReconnectCount = restoredPlaid.reconnectCount;
    count++;
  }

  return { count, exportedAt: backup.exportedAt, plaidReconnectCount };
}

/**
 * Import a backup file (Catalyst Cash .enc or .json format).
 * @param {File} file - The file to import
 * @param {Function} getPassphrase - Async function that returns the passphrase
 * @returns {Promise<{count: number, exportedAt: string, plaidReconnectCount: number}>}
 */
export async function importBackup(file, getPassphrase) {
  return new Promise((resolve, reject) => {
    if (!isSupportedBackupFile(file)) {
      reject(new Error("Unsupported backup file — choose a Catalyst Cash .enc or .json backup."));
      return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        let parsed;
        try {
          parsed = JSON.parse(e.target.result);
        } catch {
          reject(new Error("Invalid backup file"));
          return;
        }

        let backup;
        if (isEncrypted(parsed)) {
          const passphrase = getPassphrase ? await getPassphrase() : null;
          if (!passphrase) {
            reject(new Error("Import cancelled — passphrase required"));
            return;
          }
          try {
            const plaintext = await decrypt(parsed, passphrase);
            backup = JSON.parse(plaintext);
          } catch (decErr) {
            reject(new Error(decErr.message || "Decryption failed — wrong passphrase?"));
            return;
          }
        } else {
          backup = parsed;
        }

        if (backup && backup.type === "spreadsheet-backup") {
          const { loadWorkbookRows } = await loadWorkbookClientModule();
          const binary_string = window.atob(backup.base64);
          const len = binary_string.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
          }
          const workbook = await loadWorkbookRows(bytes.buffer);
          const config = {};

          // Helper to get sheet data
          const getSheetRows = sheetName => {
            return workbook.getSheetRows(sheetName);
          };

          // 1. Parse Setup Data (Key/Value list)
          const setupRows =
            getSheetRows("Setup Data") ||
            (workbook.sheetNames[0] ? getSheetRows(workbook.sheetNames[0]) : null);
          if (setupRows) {
            for (const row of setupRows) {
              const key = String(row[0] || "").trim();
              const rawVal = String(row[2] ?? "").trim();
              if (!key || !rawVal || key === "field_key" || key.includes("DO NOT EDIT")) continue;
              const num = parseFloat(rawVal);
              config[key] = isNaN(num) ? (rawVal === "true" ? true : rawVal === "false" ? false : rawVal) : num;
            }
          }

          // Helper to parse array sheets
          const parseArraySheet = (sheetName, mapFn) => {
            const rows = getSheetRows(sheetName);
            if (!rows || rows.length <= 1) return undefined;
            const items = [];
            // Skip header row (index 0)
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row.some(cell => String(cell).trim() !== "")) continue;
              const item = mapFn(row);
              if (item) items.push(item);
            }
            return items.length > 0 ? items : undefined;
          };

          // 2. Parse Arrays
          config.incomeSources =
            parseArraySheet("Income Sources", r => ({
              id: String(r[0] || Date.now() + Math.random()).trim(),
              name: String(r[1] || "Unnamed Source").trim(),
              amount: parseFloat(r[2]) || 0,
              frequency: String(r[3] || "monthly").trim(),
              type: String(r[4] || "active").trim(),
              nextDate: String(r[5] || "").trim(),
            })) || config.incomeSources;

          config.budgetCategories =
            parseArraySheet("Budget Categories", r => ({
              id: String(r[0] || Date.now() + Math.random()).trim(),
              name: String(r[1] || "Unnamed Category").trim(),
              allocated: parseFloat(r[2]) || 0,
              group: String(r[3] || "Expenses").trim(),
            })) || config.budgetCategories;

          config.savingsGoals =
            parseArraySheet("Savings Goals", r => ({
              id: String(r[0] || Date.now() + Math.random()).trim(),
              name: String(r[1] || "Unnamed Goal").trim(),
              target: parseFloat(r[2]) || 0,
              saved: parseFloat(r[3]) || 0,
            })) || config.savingsGoals;

          config.nonCardDebts =
            parseArraySheet("Non-Card Debts", r => ({
              id: String(r[0] || Date.now() + Math.random()).trim(),
              name: String(r[1] || "Unnamed Debt").trim(),
              balance: parseFloat(r[2]) || 0,
              minPayment: parseFloat(r[3]) || 0,
              apr: parseFloat(r[4]) || 0,
            })) || config.nonCardDebts;

          config.otherAssets =
            parseArraySheet("Other Assets", r => ({
              id: String(r[0] || Date.now() + Math.random()).trim(),
              name: String(r[1] || "Unnamed Asset").trim(),
              value: parseFloat(r[2]) || 0,
            })) || config.otherAssets;

          const existing = (await db.get("financial-config")) || {};
          await db.set("financial-config", { ...existing, ...config, _fromSetupWizard: true });
          resolve({ count: Object.keys(config).length, exportedAt: new Date().toISOString(), plaidReconnectCount: 0 });
          return;
        }

        resolve(await restoreBackupPayload(backup));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
