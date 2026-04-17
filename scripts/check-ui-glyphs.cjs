#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, "src", "modules");
const UI_DIR_MARKERS = [
  `${path.sep}tabs${path.sep}`,
  `${path.sep}dashboard${path.sep}`,
  `${path.sep}settings${path.sep}`,
  `${path.sep}portfolio${path.sep}`,
  `${path.sep}appShell${path.sep}`,
];
const UI_FILE_EXTENSIONS = new Set([".tsx", ".jsx", ".js"]);
const GLYPH_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{F8FF}]|\uFE0F/u;

const ALLOWED_UI_GLYPH_FILES = new Set([
  "src/modules/tabs/SetupWizard.tsx",
  "src/modules/tabs/AIChatTab.tsx",
  "src/modules/tabs/AuditTab.tsx",
  "src/modules/tabs/AddAccountSheet.tsx",
  "src/modules/tabs/BudgetTab.tsx",
  "src/modules/tabs/CashFlowCalendar.tsx",
  "src/modules/tabs/DebtSimulator.tsx",
  "src/modules/tabs/FIReSimulator.tsx",
  "src/modules/tabs/InputForm.tsx",
  "src/modules/tabs/NotificationPrePrompt.tsx",
  "src/modules/tabs/ProPaywall.tsx",
  "src/modules/tabs/RenewalsTab.tsx",
  "src/modules/tabs/ResultsView.tsx",
  "src/modules/tabs/WeeklyChallenges.tsx",
  "src/modules/tabs/setupWizard/PageDone.tsx",
  "src/modules/tabs/setupWizard/PageImport.tsx",
  "src/modules/tabs/setupWizard/PageWelcome.tsx",
  "src/modules/tabs/aiChat/helpers.tsx",
  "src/modules/tabs/CardPortfolioTab.tsx",
  "src/modules/tabs/DashboardTab.tsx",
  "src/modules/dashboard/BadgeStrip.tsx",
  "src/modules/dashboard/DashboardTopChrome.tsx",
  "src/modules/dashboard/DebtFreedomCard.tsx",
  "src/modules/dashboard/EmptyDashboard.tsx",
  "src/modules/dashboard/ScenarioSandbox.tsx",
  "src/modules/dashboard/useDashboardData.js",
  "src/modules/appShell/AppShellOverlays.tsx",
  "src/modules/settings/AISection.tsx",
  "src/modules/settings/PlaidSection.tsx",
  "src/modules/settings/SettingsHomeSections.tsx",
  "src/modules/portfolio/BankAccountsSection.tsx",
  "src/modules/portfolio/CreditCardsSection.tsx",
  "src/modules/portfolio/OtherAssetsSection.tsx",
]);

const STRICT_RUNTIME_GLYPH_FILES = new Set([
  "src/modules/demoAudit.js",
  "src/modules/memory.js",
  "src/modules/notifications.js",
  "src/modules/utils.js",
]);

function stripIconMetadata(content) {
  return content
    .replace(/(icon|emoji)\s*:\s*"[^"]*"/g, '$1: "__ICON__"')
    .replace(/(icon|emoji)\s*:\s*'[^']*'/g, "$1: '__ICON__'");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function isUiFile(relPath) {
  const ext = path.extname(relPath);
  if (!UI_FILE_EXTENSIONS.has(ext)) return false;
  if (relPath.includes(".test.") || relPath.includes(".spec.") || relPath.endsWith("UiGlyph.tsx")) return false;
  return UI_DIR_MARKERS.some((marker) => relPath.includes(marker));
}

const offenders = [];

for (const fullPath of walk(SRC_ROOT)) {
  const relPath = path.relative(ROOT, fullPath);
  const content = fs.readFileSync(fullPath, "utf8");
  if (!GLYPH_REGEX.test(content)) continue;
  if (isUiFile(relPath)) {
    if (ALLOWED_UI_GLYPH_FILES.has(relPath)) continue;
    offenders.push(relPath);
    continue;
  }
  if (STRICT_RUNTIME_GLYPH_FILES.has(relPath)) {
    if (GLYPH_REGEX.test(stripIconMetadata(content))) offenders.push(relPath);
  }
}

if (offenders.length > 0) {
  console.error("Raw emoji/private-use glyphs found in UI component files outside the current allowlist:");
  for (const offender of offenders) console.error(`- ${offender}`);
  console.error("\nMigrate those files to UiGlyph/plain text or explicitly add them to the allowlist with a reason.");
  process.exit(1);
}
