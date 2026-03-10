// ═══════════════════════════════════════════════════════════════
// backup.js — Export & Import backup logic
// Extracted from SettingsTab.jsx for clarity and testability.
// ═══════════════════════════════════════════════════════════════
import { APP_VERSION } from "./constants.js";
import { db, nativeExport } from "./utils.js";
import { encrypt, decrypt, isEncrypted } from "./crypto.js";
import { isSafeImportKey, isSecuritySensitiveKey, sanitizePlaidForBackup } from "./securityKeys.js";

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

/**
 * Legacy key migration: if old "api-key" exists, treat as openai key.
 */
export async function migrateApiKey() {
  const legacy = await db.get("api-key");
  if (legacy) {
    const existing = await db.get("api-key-openai");
    if (!existing) await db.set("api-key-openai", legacy);
  }
}

/**
 * Export a full encrypted backup of all non-sensitive db keys.
 * @param {string} passphrase - Passphrase used to encrypt the backup
 * @returns {number} Number of keys backed up
 */
export async function exportBackup(passphrase) {
  await migrateApiKey();
  const backup = { app: "Catalyst Cash", version: APP_VERSION, exportedAt: new Date().toISOString(), data: {} };

  const keys = await db.keys();
  for (const key of keys) {
    if (isSecuritySensitiveKey(key)) continue;
    const val = await db.get(key);
    if (val !== null) backup.data[key] = val;
  }
  if (!("personal-rules" in backup.data)) {
    const pr = await db.get("personal-rules");
    backup.data["personal-rules"] = pr ?? "";
  }

  // Include sanitized Plaid connections (metadata only, no access tokens)
  // so reconnecting after restore can deduplicate instead of creating new entries
  const plaidConns = await db.get("plaid-connections");
  if (Array.isArray(plaidConns) && plaidConns.length > 0) {
    backup.data["plaid-connections-sanitized"] = sanitizePlaidForBackup(plaidConns);
  }

  if (!passphrase) throw new Error("Backup cancelled — passphrase required");
  const envelope = await encrypt(JSON.stringify(backup), passphrase);
  const dateStr = new Date().toISOString().split("T")[0];
  await nativeExport(`CatalystCash_Backup_${dateStr}.enc`, JSON.stringify(envelope), "application/octet-stream");
  return Object.keys(backup.data).length;
}

/**
 * Import a backup file (encrypted .enc or spreadsheet .xlsx).
 * @param {File} file - The file to import
 * @param {Function} getPassphrase - Async function that returns the passphrase
 * @returns {Promise<{count: number, exportedAt: string}>}
 */
export async function importBackup(file, getPassphrase) {
  return new Promise((resolve, reject) => {
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
          const XLSX = await import("xlsx");
          const binary_string = window.atob(backup.base64);
          const len = binary_string.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
          }
          const wb = XLSX.read(bytes.buffer, { type: "array" });
          const config = {};

          // Helper to get sheet data
          const getSheetRows = sheetName => {
            const name = wb.SheetNames.find(n => n.includes(sheetName));
            if (!name) return null;
            return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
          };

          // 1. Parse Setup Data (Key/Value list)
          const setupRows = getSheetRows("Setup Data") || getSheetRows(wb.SheetNames[0]);
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
          resolve({ count: Object.keys(config).length, exportedAt: new Date().toISOString() });
          return;
        }

        if (!backup.data || (backup.app !== "Catalyst Cash" && backup.app !== "FinAudit Pro")) {
          reject(new Error("Invalid Catalyst Cash backup file"));
          return;
        }
        let count = 0;
        for (const [key, val] of Object.entries(backup.data)) {
          if (!isSafeImportKey(key)) continue;
          await db.set(key, val);
          count++;
        }

        // Restore sanitized Plaid connections (metadata only, no access tokens)
        // so `autoMatchAccounts` can deduplicate when the user reconnects
        const sanitizedPlaid = backup.data["plaid-connections-sanitized"];
        if (Array.isArray(sanitizedPlaid) && sanitizedPlaid.length > 0) {
          // Merge with any existing connections (don't overwrite live tokens)
          const existing = (await db.get("plaid-connections")) || [];
          const existingIds = new Set(existing.map(c => c.id));
          const merged = [...existing];
          for (const conn of sanitizedPlaid) {
            if (!existingIds.has(conn.id)) {
              merged.push({ ...conn, _needsReconnect: true });
            }
          }
          await db.set("plaid-connections", merged);
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
}
