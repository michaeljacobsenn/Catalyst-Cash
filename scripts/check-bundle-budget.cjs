#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const distAssetsDir = path.join(process.cwd(), "dist", "assets");

const budgets = {
  mainEntry: 540000,
  portfolioShell: 5000,
  cardPortfolio: 70000,
  cardWizard: 50000,
  settingsTab: 100000,
  setupWizard: 70000,
  marketData: 45000,
  spreadsheet: 7000,
  workbookWorker: 75000,
  auditExports: 15000,
  auditHtmlFallback: 6000,
  shellBootJs: 610000,
};

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function getAssets() {
  if (!fs.existsSync(distAssetsDir)) {
    throw new Error("dist/assets not found. Run `npm run build` first.");
  }

  return fs.readdirSync(distAssetsDir).map(name => ({
    name,
    bytes: fs.statSync(path.join(distAssetsDir, name)).size,
  }));
}

function findByPrefix(assets, prefix) {
  const matches = assets
    .filter(asset => asset.name.startsWith(prefix) && asset.name.endsWith(".js"))
    .sort((a, b) => b.bytes - a.bytes);
  const match = matches[0];
  if (!match) {
    throw new Error(`Missing expected chunk with prefix: ${prefix}`);
  }
  return match;
}

function main() {
  const shouldCheck = process.argv.includes("--check");
  const assets = getAssets();

  const selected = {
    mainEntry: findByPrefix(assets, "index-"),
    vendorReact: findByPrefix(assets, "vendor-react-"),
    vendorCapacitor: findByPrefix(assets, "vendor-capacitor-"),
    portfolioShell: findByPrefix(assets, "PortfolioTab-"),
    cardPortfolio: findByPrefix(assets, "CardPortfolioTab-"),
    cardWizard: findByPrefix(assets, "CardWizardTab-"),
    settingsTab: findByPrefix(assets, "SettingsTab-"),
    setupWizard: findByPrefix(assets, "SetupWizard-"),
    marketData: findByPrefix(assets, "market-data-"),
    spreadsheet: findByPrefix(assets, "spreadsheet-"),
    workbookWorker: findByPrefix(assets, "excelWorkbook.worker-"),
    auditExports: findByPrefix(assets, "audit-exports-"),
    auditHtmlFallback: findByPrefix(assets, "auditHtmlDocument-"),
  };

  const shellBootJs = selected.mainEntry.bytes + selected.vendorReact.bytes + selected.vendorCapacitor.bytes;

  const rows = [
    { metric: "mainEntry", file: selected.mainEntry.name, size: formatKb(selected.mainEntry.bytes), budget: formatKb(budgets.mainEntry) },
    { metric: "portfolioShell", file: selected.portfolioShell.name, size: formatKb(selected.portfolioShell.bytes), budget: formatKb(budgets.portfolioShell) },
    { metric: "cardPortfolio", file: selected.cardPortfolio.name, size: formatKb(selected.cardPortfolio.bytes), budget: formatKb(budgets.cardPortfolio) },
    { metric: "cardWizard", file: selected.cardWizard.name, size: formatKb(selected.cardWizard.bytes), budget: formatKb(budgets.cardWizard) },
    { metric: "settingsTab", file: selected.settingsTab.name, size: formatKb(selected.settingsTab.bytes), budget: formatKb(budgets.settingsTab) },
    { metric: "setupWizard", file: selected.setupWizard.name, size: formatKb(selected.setupWizard.bytes), budget: formatKb(budgets.setupWizard) },
    { metric: "marketData", file: selected.marketData.name, size: formatKb(selected.marketData.bytes), budget: formatKb(budgets.marketData) },
    { metric: "spreadsheet", file: selected.spreadsheet.name, size: formatKb(selected.spreadsheet.bytes), budget: formatKb(budgets.spreadsheet) },
    { metric: "workbookWorker", file: selected.workbookWorker.name, size: formatKb(selected.workbookWorker.bytes), budget: formatKb(budgets.workbookWorker) },
    { metric: "auditExports", file: selected.auditExports.name, size: formatKb(selected.auditExports.bytes), budget: formatKb(budgets.auditExports) },
    { metric: "auditHtmlFallback", file: selected.auditHtmlFallback.name, size: formatKb(selected.auditHtmlFallback.bytes), budget: formatKb(budgets.auditHtmlFallback) },
    { metric: "shellBootJs", file: "mainEntry + vendorReact + vendorCapacitor", size: formatKb(shellBootJs), budget: formatKb(budgets.shellBootJs) },
  ];

  console.table(rows);

  if (!shouldCheck) return;

  const failures = [];
  const metricSizes = {
    mainEntry: selected.mainEntry.bytes,
    portfolioShell: selected.portfolioShell.bytes,
    cardPortfolio: selected.cardPortfolio.bytes,
    cardWizard: selected.cardWizard.bytes,
    settingsTab: selected.settingsTab.bytes,
    setupWizard: selected.setupWizard.bytes,
    marketData: selected.marketData.bytes,
    spreadsheet: selected.spreadsheet.bytes,
    workbookWorker: selected.workbookWorker.bytes,
    auditExports: selected.auditExports.bytes,
    auditHtmlFallback: selected.auditHtmlFallback.bytes,
    shellBootJs,
  };

  for (const [metric, size] of Object.entries(metricSizes)) {
    if (size > budgets[metric]) {
      failures.push(`${metric} ${formatKb(size)} exceeded budget ${formatKb(budgets[metric])}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nBundle budget regression detected:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nBundle budgets passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
