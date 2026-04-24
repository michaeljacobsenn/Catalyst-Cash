#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const distAssetsDir = path.join(process.cwd(), "dist", "assets");

const budgets = {
  mainEntry: 205000,
  appChunk: 160000,
  portfolioShell: 5000,
  cardPortfolio: 76000,
  cardWizard: 87000,
  inputForm: 110000,
  settingsTab: 60000,
  setupWizard: 45000,
  marketData: 45000,
  spreadsheet: 7000,
  workbookWorker: 75000,
  auditExports: 15000,
  auditHtmlFallback: 6000,
  shellBootJs: 520000,
  negotiation: 45000,
  decisionRules: 30000,
  rewardsCatalog: 50000,
  merchantDatabase: 40000,
  tickerCatalog: 25000,
  fireCalc: 10000,
  bankCatalog: 12000,
  vendorMotion: 140000,
  vendorIcons: 50000,
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
    appChunk: findByPrefix(assets, "App-"),
    vendorReact: findByPrefix(assets, "vendor-react-"),
    vendorCapacitor: findByPrefix(assets, "vendor-capacitor-"),
    portfolioShell: findByPrefix(assets, "PortfolioTab-"),
    cardPortfolio: findByPrefix(assets, "CardPortfolioTab-"),
    cardWizard: findByPrefix(assets, "CardWizardTab-"),
    inputForm: findByPrefix(assets, "InputForm-"),
    settingsTab: findByPrefix(assets, "SettingsTab-"),
    setupWizard: findByPrefix(assets, "SetupWizard-"),
    marketData: findByPrefix(assets, "market-data-"),
    spreadsheet: findByPrefix(assets, "spreadsheet-"),
    workbookWorker: findByPrefix(assets, "excelWorkbook.worker-"),
    auditExports: findByPrefix(assets, "audit-exports-"),
    auditHtmlFallback: findByPrefix(assets, "auditHtmlDocument-"),
    negotiation: findByPrefix(assets, "negotiation-"),
    decisionRules: findByPrefix(assets, "decision-rules-"),
    rewardsCatalog: findByPrefix(assets, "rewards-catalog-"),
    merchantDatabase: findByPrefix(assets, "merchant-database-"),
    tickerCatalog: findByPrefix(assets, "ticker-catalog-"),
    fireCalc: findByPrefix(assets, "fire-calc-"),
    bankCatalog: findByPrefix(assets, "bank-catalog-"),
    vendorMotion: findByPrefix(assets, "vendor-motion-"),
    vendorIcons: findByPrefix(assets, "vendor-icons-"),
  };

  const shellBootJs = selected.mainEntry.bytes + selected.appChunk.bytes + selected.vendorReact.bytes + selected.vendorCapacitor.bytes;

  const rows = [
    { metric: "mainEntry", file: selected.mainEntry.name, size: formatKb(selected.mainEntry.bytes), budget: formatKb(budgets.mainEntry) },
    { metric: "appChunk", file: selected.appChunk.name, size: formatKb(selected.appChunk.bytes), budget: formatKb(budgets.appChunk) },
    { metric: "portfolioShell", file: selected.portfolioShell.name, size: formatKb(selected.portfolioShell.bytes), budget: formatKb(budgets.portfolioShell) },
    { metric: "cardPortfolio", file: selected.cardPortfolio.name, size: formatKb(selected.cardPortfolio.bytes), budget: formatKb(budgets.cardPortfolio) },
    { metric: "cardWizard", file: selected.cardWizard.name, size: formatKb(selected.cardWizard.bytes), budget: formatKb(budgets.cardWizard) },
    { metric: "inputForm", file: selected.inputForm.name, size: formatKb(selected.inputForm.bytes), budget: formatKb(budgets.inputForm) },
    { metric: "settingsTab", file: selected.settingsTab.name, size: formatKb(selected.settingsTab.bytes), budget: formatKb(budgets.settingsTab) },
    { metric: "setupWizard", file: selected.setupWizard.name, size: formatKb(selected.setupWizard.bytes), budget: formatKb(budgets.setupWizard) },
    { metric: "marketData", file: selected.marketData.name, size: formatKb(selected.marketData.bytes), budget: formatKb(budgets.marketData) },
    { metric: "spreadsheet", file: selected.spreadsheet.name, size: formatKb(selected.spreadsheet.bytes), budget: formatKb(budgets.spreadsheet) },
    { metric: "workbookWorker", file: selected.workbookWorker.name, size: formatKb(selected.workbookWorker.bytes), budget: formatKb(budgets.workbookWorker) },
    { metric: "auditExports", file: selected.auditExports.name, size: formatKb(selected.auditExports.bytes), budget: formatKb(budgets.auditExports) },
    { metric: "auditHtmlFallback", file: selected.auditHtmlFallback.name, size: formatKb(selected.auditHtmlFallback.bytes), budget: formatKb(budgets.auditHtmlFallback) },
    { metric: "negotiation", file: selected.negotiation.name, size: formatKb(selected.negotiation.bytes), budget: formatKb(budgets.negotiation) },
    { metric: "decisionRules", file: selected.decisionRules.name, size: formatKb(selected.decisionRules.bytes), budget: formatKb(budgets.decisionRules) },
    { metric: "rewardsCatalog", file: selected.rewardsCatalog.name, size: formatKb(selected.rewardsCatalog.bytes), budget: formatKb(budgets.rewardsCatalog) },
    { metric: "merchantDatabase", file: selected.merchantDatabase.name, size: formatKb(selected.merchantDatabase.bytes), budget: formatKb(budgets.merchantDatabase) },
    { metric: "tickerCatalog", file: selected.tickerCatalog.name, size: formatKb(selected.tickerCatalog.bytes), budget: formatKb(budgets.tickerCatalog) },
    { metric: "fireCalc", file: selected.fireCalc.name, size: formatKb(selected.fireCalc.bytes), budget: formatKb(budgets.fireCalc) },
    { metric: "bankCatalog", file: selected.bankCatalog.name, size: formatKb(selected.bankCatalog.bytes), budget: formatKb(budgets.bankCatalog) },
    { metric: "vendorMotion", file: selected.vendorMotion.name, size: formatKb(selected.vendorMotion.bytes), budget: formatKb(budgets.vendorMotion) },
    { metric: "vendorIcons", file: selected.vendorIcons.name, size: formatKb(selected.vendorIcons.bytes), budget: formatKb(budgets.vendorIcons) },
    { metric: "shellBootJs", file: "mainEntry + appChunk + vendorReact + vendorCapacitor", size: formatKb(shellBootJs), budget: formatKb(budgets.shellBootJs) },
  ];

  console.table(rows);

  if (!shouldCheck) return;

  const failures = [];
  const metricSizes = {
    mainEntry: selected.mainEntry.bytes,
    appChunk: selected.appChunk.bytes,
    portfolioShell: selected.portfolioShell.bytes,
    cardPortfolio: selected.cardPortfolio.bytes,
    cardWizard: selected.cardWizard.bytes,
    inputForm: selected.inputForm.bytes,
    settingsTab: selected.settingsTab.bytes,
    setupWizard: selected.setupWizard.bytes,
    marketData: selected.marketData.bytes,
    spreadsheet: selected.spreadsheet.bytes,
    workbookWorker: selected.workbookWorker.bytes,
    auditExports: selected.auditExports.bytes,
    auditHtmlFallback: selected.auditHtmlFallback.bytes,
    negotiation: selected.negotiation.bytes,
    decisionRules: selected.decisionRules.bytes,
    rewardsCatalog: selected.rewardsCatalog.bytes,
    merchantDatabase: selected.merchantDatabase.bytes,
    tickerCatalog: selected.tickerCatalog.bytes,
    fireCalc: selected.fireCalc.bytes,
    bankCatalog: selected.bankCatalog.bytes,
    vendorMotion: selected.vendorMotion.bytes,
    vendorIcons: selected.vendorIcons.bytes,
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
