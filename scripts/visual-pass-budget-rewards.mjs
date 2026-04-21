import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

const BASE_URL =
  process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=")[1] ||
  process.env.VISUAL_PASS_BASE_URL ||
  "http://127.0.0.1:4173/";

const DEFAULT_SURFACES = ["dashboard", "audit", "bills", "budget", "vault", "rewards", "chat", "settings", "financial-profile", "backup"];
const SURFACES = (
  process.argv.find((arg) => arg.startsWith("--surfaces="))?.split("=")[1] ||
  process.env.VISUAL_PASS_SURFACES ||
  DEFAULT_SURFACES.join(",")
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const OUTPUT_DIR = path.resolve("output/playwright/visual-pass-core-surfaces");
const API_HOST_PATTERN = "(?:api\\.catalystcash\\.app|catalystcash-api\\.portfoliopro-app\\.workers\\.dev)";
const CONFIG_ROUTE = new RegExp(`https://${API_HOST_PATTERN}/config$`);
const MARKET_ROUTE = new RegExp(`https://${API_HOST_PATTERN}/market(?:\\?.*)?$`);
const REFERRAL_STATS_ROUTE = new RegExp(`https://${API_HOST_PATTERN}/referral/stats(?:\\?.*)?$`);
const OTA_CATALOG_ROUTE = /^https:\/\/catalystcash\.app\/data\/catalog\.json(?:\?.*)?$/;
const OTA_MERCHANTS_ROUTE = /^https:\/\/catalystcash\.app\/data\/merchants\.json(?:\?.*)?$/;

const MAIN_PAGE_SELECTOR = '.snap-page[aria-hidden="false"] .page-body';
const INPUT_PAGE_SELECTOR = ".page-body";
const SETTINGS_PAGE_SELECTOR = ".safe-scroll-body.page-body";

const DEVICES = [
  { id: "iphone-compact", width: 375, height: 812, isMobile: true, hasTouch: true },
  { id: "iphone-max", width: 430, height: 932, isMobile: true, hasTouch: true },
  { id: "ipad-portrait", width: 820, height: 1180, isMobile: true, hasTouch: true },
  { id: "ipad-landscape", width: 1180, height: 820, isMobile: false, hasTouch: true },
];

const SEEDED_CARDS = [
  {
    id: "visual-freedom-unlimited",
    institution: "Chase",
    issuer: "Chase",
    network: "Visa",
    name: "Freedom Unlimited",
    limit: 12000,
    balance: 1460,
    apr: 24.99,
    minPayment: 45,
    statementCloseDay: 21,
    paymentDueDay: 17,
    annualFee: 0,
    type: "credit",
  },
  {
    id: "visual-amex-gold",
    institution: "American Express",
    issuer: "American Express",
    network: "Amex",
    name: "Gold Card",
    limit: 8000,
    balance: 720,
    apr: 0,
    minPayment: 0,
    annualFee: 325,
    type: "credit",
  },
  {
    id: "visual-savorone",
    institution: "Capital One",
    issuer: "Capital One",
    network: "Mastercard",
    name: "SavorOne Cash Rewards",
    limit: 10000,
    balance: 410,
    apr: 25.49,
    minPayment: 35,
    annualFee: 0,
    type: "credit",
  },
  {
    id: "visual-venture-x",
    institution: "Capital One",
    issuer: "Capital One",
    network: "Visa",
    name: "Venture X Rewards",
    limit: 22000,
    balance: 1210,
    apr: 0,
    minPayment: 0,
    annualFee: 395,
    type: "credit",
  },
  {
    id: "visual-blue-cash-everyday",
    institution: "American Express",
    issuer: "American Express",
    network: "Amex",
    name: "Blue Cash Everyday Card",
    limit: 9000,
    balance: 285,
    apr: 23.99,
    minPayment: 30,
    annualFee: 0,
    type: "credit",
  },
];

const SEEDED_BANKS = [
  {
    id: "visual-checking",
    bank: "Ally",
    accountType: "checking",
    name: "Primary Checking",
    balance: 4625,
  },
  {
    id: "visual-savings",
    bank: "Ally",
    accountType: "savings",
    name: "Emergency Savings",
    balance: 6150,
    apy: 4.2,
  },
];

const SEEDED_RENEWALS = [
  {
    id: "visual-rent",
    name: "Rent",
    amount: 2100,
    interval: 1,
    intervalUnit: "months",
    cadence: "1 month",
    category: "housing",
    nextDue: "2026-05-01",
    source: "Visual QA",
  },
  {
    id: "visual-netflix",
    name: "Netflix",
    amount: 15.49,
    interval: 1,
    intervalUnit: "months",
    cadence: "1 month",
    category: "subs",
    nextDue: "2026-04-28",
    source: "Visual QA",
  },
];

const SEEDED_BUDGET_LINES = [
  { id: "budget-rent", name: "Rent", amount: 1050, bucket: "bills", icon: "🏠", isAuto: false },
  { id: "budget-utilities", name: "Utilities", amount: 180, bucket: "bills", icon: "💡", isAuto: false },
  { id: "budget-groceries", name: "Groceries", amount: 320, bucket: "needs", icon: "🛒", isAuto: false },
  { id: "budget-fuel", name: "Fuel", amount: 90, bucket: "needs", icon: "⛽", isAuto: false },
  { id: "budget-dining", name: "Dining Out", amount: 110, bucket: "wants", icon: "🍽️", isAuto: false },
  { id: "budget-fun", name: "Weekend Fun", amount: 80, bucket: "wants", icon: "🎟️", isAuto: false },
  { id: "budget-emergency", name: "Emergency Fund", amount: 275, bucket: "savings", icon: "🛟", isAuto: false },
  { id: "budget-travel", name: "Travel Fund", amount: 120, bucket: "savings", icon: "✈️", isAuto: false },
];

const SEEDED_NOW = Date.now();

const SEEDED_AUDIT = {
  ts: 1776662400000,
  date: "2026-04-20",
  provider: "backend",
  model: "gemini-2.5-flash",
  parsed: {
    headerCard: {
      status: "GREEN",
      details: ["Visual QA seed active", "Cash floor protected"],
    },
    healthScore: {
      score: 87,
      grade: "B+",
      trend: "up",
      summary: "Healthy cash coverage with clean spending control.",
      narrative: "This seeded audit keeps the shell in a realistic, stable state for responsive UI checks.",
    },
    dashboardCard: [
      { category: "Checking", amount: "$4,625.00", status: "Protected" },
      { category: "Vault", amount: "$6,150.00", status: "On track" },
      { category: "Pending", amount: "$225.00", status: "Upcoming" },
      { category: "Debts", amount: "$4,085.00", status: "Tracked" },
      { category: "Available", amount: "$1,325.00", status: "SURPLUS" },
    ],
    weeklyMoves: ["Hold checking above $1,500.", "Route surplus cash toward high-interest debt first."],
    nextAction: "Hold checking above $1,500 and keep payoff pressure on high-interest cards.",
    categories: {
      Rent: { total: 1050 },
      Utilities: { total: 165 },
      Groceries: { total: 298 },
      Fuel: { total: 86 },
      "Dining Out": { total: 142 },
      "Weekend Fun": { total: 74 },
      "Emergency Fund": { total: 275 },
      "Travel Fund": { total: 120 },
    },
  },
  moveChecks: {},
  form: {
    date: "2026-04-20",
    checkingBalance: 4625,
    notes: "Visual QA seeded audit",
  },
};

const SEEDED_CHAT_HISTORY = [
  {
    role: "user",
    content: "How much room do I have before payday?",
    ts: SEEDED_NOW - 5 * 60 * 1000,
  },
  {
    role: "assistant",
    content:
      "You have about **$425** of weekly spend room before Friday if you keep checking above your $1,500 floor.",
    ts: SEEDED_NOW - 4 * 60 * 1000,
  },
  {
    role: "user",
    content: "Should I use checking or savings for the dentist bill?",
    ts: SEEDED_NOW - 3 * 60 * 1000,
  },
  {
    role: "assistant",
    content:
      "Pay it from checking if the bill stays inside your protected buffer. If it would push checking below **$1,500**, pull only the difference from savings instead of floating it on a card.",
    ts: SEEDED_NOW - 2 * 60 * 1000,
  },
  {
    role: "user",
    content: "What if the bill comes in closer to $900?",
    ts: SEEDED_NOW - 60 * 1000,
  },
];

const SEEDED_CHAT_FEEDBACK = {
  [String(SEEDED_CHAT_HISTORY[1].ts)]: {
    verdict: "helpful",
    reasons: [],
    updatedAt: SEEDED_NOW - 45 * 1000,
  },
  [String(SEEDED_CHAT_HISTORY[3].ts)]: {
    verdict: "needs-work",
    reasons: ["too_generic", "missed_context"],
    updatedAt: SEEDED_NOW - 30 * 1000,
  },
};

const SEEDED_STORAGE = {
  "onboarding-complete": true,
  "financial-config": {
    incomeType: "salary",
    payFrequency: "bi-weekly",
    payday: "Friday",
    paycheckStandard: 3200,
    paycheckFirstOfMonth: 2800,
    weeklySpendAllowance: 425,
    emergencyFloor: 1500,
    greenStatusTarget: 4200,
    emergencyReserveTarget: 18000,
    defaultAPR: 22.99,
    arbitrageTargetAPR: 6,
    currencyCode: "USD",
    stateCode: "CA",
    birthYear: 1991,
    preferredName: "Jordan",
    housingType: "rent",
    monthlyRent: 2100,
    trackChecking: true,
    trackSavings: true,
    trackBrokerage: true,
    trackRoth: true,
    track401k: true,
    trackHSA: true,
    investmentBrokerage: 9600,
    investmentRoth: 7200,
    k401Balance: 18400,
    hsaBalance: 2100,
  },
  "card-portfolio": SEEDED_CARDS,
  "bank-accounts": SEEDED_BANKS,
  renewals: SEEDED_RENEWALS,
  "budget-lines-v2": SEEDED_BUDGET_LINES,
  "ai-provider": "backend",
  "ai-model": "gemini-2.5-flash",
  "ai-consent-accepted": true,
  "current-audit": SEEDED_AUDIT,
  "audit-history": [SEEDED_AUDIT],
  "move-states": {},
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function maxOverflow(samples = {}) {
  return Object.values(samples).reduce((max, sample) => Math.max(max, sample?.overflowX || 0), 0);
}

async function applyBaseRoutes(page) {
  await page.route(CONFIG_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gatingMode: "off",
        minVersion: "2.0.0",
        platformPolicy: {
          web: {
            secureSecretPersistence: false,
            appLock: false,
            biometricUnlock: false,
            appleSignIn: false,
            cloudBackup: false,
            householdSync: false,
          },
        },
      }),
    });
  });

  await page.route(MARKET_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ prices: {} }),
    });
  });

  await page.route(REFERRAL_STATS_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "VISUALQA",
        totalReferred: 0,
        pendingReferred: 0,
        bonusMonthsEarned: 0,
      }),
    });
  });

  await page.route(OTA_CATALOG_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route(OTA_MERCHANTS_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

async function seedStorage(page) {
  await page.addInitScript((payload) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.entries(payload).forEach(([key, value]) => {
      const serialized = JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
      window.localStorage.setItem(`CapacitorStorage.${key}`, serialized);
    });
  }, SEEDED_STORAGE);
}

async function queueStoragePatchOnNextLoad(page, payload) {
  await page.addInitScript((entries) => {
    Object.entries(entries).forEach(([key, value]) => {
      const serialized = JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
      window.localStorage.setItem(`CapacitorStorage.${key}`, serialized);
    });
  }, payload);
}

async function removeStorageKeys(page, keys) {
  await page.evaluate((targetKeys) => {
    targetKeys.forEach((key) => {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`CapacitorStorage.${key}`);
    });
  }, keys);
}

async function screenshotSection(page, targetPath) {
  ensureDir(path.dirname(targetPath));
  await page.screenshot({ path: targetPath });
}

async function waitForAppShell(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open Settings" }).waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("tab", { name: "Home" }).waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(700);
}

async function clickMainTab(page, name) {
  await page.getByRole("tab", { name, exact: true }).click();
  await page.waitForTimeout(450);
}

async function openSettingsSection(page, menuLabel, headingLabel) {
  await page.getByRole("button", { name: "Open Settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: menuLabel }).click();
  await page.getByRole("heading", { name: headingLabel }).waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(450);
}

async function detectLayoutIssues(page, { rootSelector } = {}) {
  return page.evaluate((selector) => {
    function visibleArea(element) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
        return 0;
      }
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return width * height;
    }

    function chooseBest(elements) {
      return elements
        .map((element) => ({ element, area: visibleArea(element) }))
        .filter((entry) => entry.area > 0)
        .sort((left, right) => right.area - left.area)[0]?.element || null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const activePage = document.querySelector('.snap-page[aria-hidden="false"]');
    const scopedMatches = selector ? Array.from(document.querySelectorAll(selector)) : [];
    const scopeRoot =
      chooseBest(scopedMatches) ||
      chooseBest(activePage ? [activePage, ...activePage.querySelectorAll(".page-body")] : []) ||
      document.body;

    const documentRoot = document.scrollingElement || document.documentElement;
    const fixedShellNodes = [
      ...document.querySelectorAll("header *"),
      ...document.querySelectorAll('nav[aria-label="Main navigation"] *'),
    ];
    const candidateNodes = [scopeRoot, ...scopeRoot.querySelectorAll("*"), ...fixedShellNodes];
    const scopeOverflowX = Math.max(0, Math.ceil((scopeRoot.scrollWidth || 0) - (scopeRoot.clientWidth || viewportWidth)));
    const documentOverflowX = Math.max(0, Math.ceil((documentRoot.scrollWidth || 0) - viewportWidth));

    const offenders = Array.from(new Set(candidateNodes))
      .map((node) => {
        const element = node;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width <= 1 ||
          rect.height <= 1
        ) {
          return null;
        }
        const intersectsViewport =
          rect.bottom >= 0 &&
          rect.top <= viewportHeight &&
          rect.right >= 0 &&
          rect.left <= viewportWidth;
        const isFixed = style.position === "fixed" || style.position === "sticky";
        if (!intersectsViewport && !isFixed) return null;
        const overflowLeft = rect.left < -2;
        const overflowRight = rect.right > viewportWidth + 2;
        if (!overflowLeft && !overflowRight) return null;
        const label = [
          element.tagName.toLowerCase(),
          element.id ? `#${element.id}` : "",
          ...Array.from(element.classList).slice(0, 2).map((className) => `.${className}`),
        ].join("");
        return {
          label,
          text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          left: Number(rect.left.toFixed(1)),
          right: Number(rect.right.toFixed(1)),
          width: Number(rect.width.toFixed(1)),
        };
      })
      .filter(Boolean)
      .slice(0, 20);

    return {
      viewportWidth,
      viewportHeight,
      scopeSelector: selector || null,
      scopeClientWidth: scopeRoot.clientWidth || viewportWidth,
      scopeScrollWidth: scopeRoot.scrollWidth || viewportWidth,
      overflowX: Math.max(scopeOverflowX, documentOverflowX),
      offenders,
    };
  }, rootSelector || null);
}

async function getScrollCheckpoints(page, { rootSelector } = {}) {
  return page.evaluate((selector) => {
    function visibleArea(element) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return 0;
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return width * height;
    }

    function chooseBest(elements) {
      return elements
        .map((element) => ({ element, area: visibleArea(element) }))
        .filter((entry) => entry.area > 0)
        .sort((left, right) => right.area - left.area)[0]?.element || null;
    }

    const activePage = document.querySelector('.snap-page[aria-hidden="false"]');
    const scopedMatches = selector ? Array.from(document.querySelectorAll(selector)) : [];
    const scopeRoot =
      chooseBest(scopedMatches) ||
      chooseBest(activePage ? [activePage, ...activePage.querySelectorAll(".page-body")] : []) ||
      document.body;

    const scrollCandidates = [scopeRoot, ...scopeRoot.querySelectorAll("*")]
      .map((element) => {
        const style = window.getComputedStyle(element);
        const canScroll =
          /(auto|scroll)/.test(style.overflowY || "") ||
          /(auto|scroll)/.test(style.overflow || "");
        return {
          element,
          range: Math.max(0, element.scrollHeight - element.clientHeight),
          canScroll,
        };
      })
      .filter((entry) => entry.canScroll && entry.range > 40)
      .sort((left, right) => right.range - left.range);

    const scroller = scrollCandidates[0]?.element || document.scrollingElement || document.documentElement;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const checkpoints = [{ id: "top", progress: 0 }];

    if (maxScroll > 40) {
      if (maxScroll > Math.max(window.innerHeight * 0.75, 240)) {
        checkpoints.push({ id: "middle", progress: 0.5 });
      }
      checkpoints.push({ id: "bottom", progress: 1 });
    }

    return checkpoints;
  }, rootSelector || null);
}

async function setSurfaceScroll(page, { rootSelector, progress }) {
  await page.evaluate(
    ({ selector, nextProgress }) => {
      function visibleArea(element) {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return 0;
        const rect = element.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return width * height;
      }

      function chooseBest(elements) {
        return elements
          .map((element) => ({ element, area: visibleArea(element) }))
          .filter((entry) => entry.area > 0)
          .sort((left, right) => right.area - left.area)[0]?.element || null;
      }

      const activePage = document.querySelector('.snap-page[aria-hidden="false"]');
      const scopedMatches = selector ? Array.from(document.querySelectorAll(selector)) : [];
      const scopeRoot =
        chooseBest(scopedMatches) ||
        chooseBest(activePage ? [activePage, ...activePage.querySelectorAll(".page-body")] : []) ||
        document.body;

      const scrollCandidates = [scopeRoot, ...scopeRoot.querySelectorAll("*")]
        .map((element) => {
          const style = window.getComputedStyle(element);
          const canScroll =
            /(auto|scroll)/.test(style.overflowY || "") ||
            /(auto|scroll)/.test(style.overflow || "");
          return {
            element,
            range: Math.max(0, element.scrollHeight - element.clientHeight),
            canScroll,
          };
        })
        .filter((entry) => entry.canScroll && entry.range > 40)
        .sort((left, right) => right.range - left.range);

      const scroller = scrollCandidates[0]?.element || document.scrollingElement || document.documentElement;
      const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const target = Math.round(maxScroll * nextProgress);
      scroller.scrollTo({ top: target, behavior: "instant" });
    },
    { selector: rootSelector || null, nextProgress: progress }
  );
  await page.waitForTimeout(250);
}

async function captureSamples(page, outputDir, slug, { rootSelector } = {}) {
  const checkpoints = await getScrollCheckpoints(page, { rootSelector });
  const samples = {};

  for (const checkpoint of checkpoints) {
    await setSurfaceScroll(page, { rootSelector, progress: checkpoint.progress });
    samples[checkpoint.id] = await detectLayoutIssues(page, { rootSelector });
    await screenshotSection(page, path.join(outputDir, `${slug}-${checkpoint.id}.png`));
  }

  await setSurfaceScroll(page, { rootSelector, progress: 0 });
  return samples;
}

async function captureDashboardState(page, outputDir) {
  await waitForAppShell(page);
  await clickMainTab(page, "Home");
  await page.getByRole("heading", { name: "Dashboard" }).first().waitFor({ state: "visible", timeout: 15000 });
  return captureSamples(page, outputDir, "dashboard", { rootSelector: MAIN_PAGE_SELECTOR });
}

async function captureAuditState(page, outputDir) {
  await waitForAppShell(page);
  await clickMainTab(page, "Audit");
  const runButton = page.getByRole("button", { name: /Run New Audit|Prepare Next Audit/i }).first();
  await runButton.waitFor({ state: "visible", timeout: 15000 });
  const home = await captureSamples(page, outputDir, "audit-home", { rootSelector: MAIN_PAGE_SELECTOR });

  await runButton.click();
  await page.getByText("Prepare Weekly Audit").first().waitFor({ state: "visible", timeout: 15000 });
  const composer = await captureSamples(page, outputDir, "audit-composer", { rootSelector: INPUT_PAGE_SELECTOR });
  return { home, composer };
}

async function captureBudgetState(page, outputDir) {
  await waitForAppShell(page);
  await clickMainTab(page, "Cashflow");
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await page.getByText(/take-home/i).first().waitFor({ state: "visible", timeout: 15000 });
  return captureSamples(page, outputDir, "budget", { rootSelector: MAIN_PAGE_SELECTOR });
}

async function captureBillsState(page, outputDir) {
  await waitForAppShell(page);
  await clickMainTab(page, "Cashflow");
  await page.getByRole("button", { name: "Bills", exact: true }).click();
  await page.getByText(/Recurring Load|Monthly Burn Rate/i).first().waitFor({ state: "visible", timeout: 15000 });
  return captureSamples(page, outputDir, "bills", { rootSelector: MAIN_PAGE_SELECTOR });
}

async function captureVaultState(page, outputDir) {
  await waitForAppShell(page);
  await clickMainTab(page, "Portfolio");
  await page.getByRole("button", { name: "Vault", exact: true }).click();
  await page.getByText(/Portfolio Snapshot|Liquid Cash/i).first().waitFor({ state: "visible", timeout: 15000 });
  return captureSamples(page, outputDir, "vault", { rootSelector: MAIN_PAGE_SELECTOR });
}

async function captureRewardsState(page, outputDir) {
  await waitForAppShell(page);
  await clickMainTab(page, "Portfolio");
  await page.getByRole("button", { name: "Rewards", exact: true }).click();
  await page.getByText("Choose the right card").waitFor({ state: "visible", timeout: 15000 });
  const home = await captureSamples(page, outputDir, "rewards-home", { rootSelector: MAIN_PAGE_SELECTOR });

  const searchBox = page.getByPlaceholder("Amazon, Uber, Starbucks");
  await searchBox.fill("Amazon");
  await searchBox.press("Enter");
  await page.getByText("Best match").waitFor({ state: "visible", timeout: 15000 });
  await page.getByPlaceholder("Spend amount (optional)").fill("125");
  await page.waitForTimeout(350);

  const result = await captureSamples(page, outputDir, "rewards-result", { rootSelector: MAIN_PAGE_SELECTOR });
  return { home, result };
}

async function captureChatState(page, outputDir) {
  await waitForAppShell(page);
  await removeStorageKeys(page, ["ai-chat-history", "ai-chat-feedback"]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppShell(page);
  await clickMainTab(page, "Ask AI");
  await page.getByText("Ask Anything").waitFor({ state: "visible", timeout: 15000 });
  const empty = await captureSamples(page, outputDir, "chat-empty", { rootSelector: MAIN_PAGE_SELECTOR });

  await queueStoragePatchOnNextLoad(page, {
    "ai-chat-history": SEEDED_CHAT_HISTORY,
    "ai-chat-feedback": SEEDED_CHAT_FEEDBACK,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppShell(page);
  await clickMainTab(page, "Ask AI");
  await page.getByText(/How much room do I have before payday\?|What if the bill comes in closer to \$900\?/).first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(900);
  const history = await captureSamples(page, outputDir, "chat-history", { rootSelector: MAIN_PAGE_SELECTOR });
  return { empty, history };
}

async function captureFinancialProfileState(page, outputDir) {
  await waitForAppShell(page);
  await openSettingsSection(page, /Financial Profile/i, "Financial Profile");
  return captureSamples(page, outputDir, "financial-profile", { rootSelector: SETTINGS_PAGE_SELECTOR });
}

async function captureSettingsHomeState(page, outputDir) {
  await waitForAppShell(page);
  await page.getByRole("button", { name: "Open Settings" }).click();
  await page.getByRole("heading", { name: "Settings" }).waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(450);
  return captureSamples(page, outputDir, "settings", { rootSelector: SETTINGS_PAGE_SELECTOR });
}

async function captureBackupState(page, outputDir) {
  await waitForAppShell(page);
  await openSettingsSection(page, /Backup & Sync/i, "Backup & Data");
  return captureSamples(page, outputDir, "backup", { rootSelector: SETTINGS_PAGE_SELECTOR });
}

async function run() {
  ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const report = {
    baseUrl: BASE_URL,
    surfaces: SURFACES,
    generatedAt: new Date().toISOString(),
    devices: {},
  };

  for (const device of DEVICES) {
    const deviceDir = path.join(OUTPUT_DIR, device.id);
    ensureDir(deviceDir);

    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 1,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
    });

    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(cleanText(message.text()));
      }
    });

    try {
      await applyBaseRoutes(page);
      await seedStorage(page);

      const deviceReport = {
        viewport: { width: device.width, height: device.height },
      };

      if (SURFACES.includes("dashboard")) {
        deviceReport.dashboard = await captureDashboardState(page, deviceDir);
      }
      if (SURFACES.includes("audit")) {
        deviceReport.audit = await captureAuditState(page, deviceDir);
      }
      if (SURFACES.includes("bills")) {
        deviceReport.bills = await captureBillsState(page, deviceDir);
      }
      if (SURFACES.includes("budget")) {
        deviceReport.budget = await captureBudgetState(page, deviceDir);
      }
      if (SURFACES.includes("vault")) {
        deviceReport.vault = await captureVaultState(page, deviceDir);
      }
      if (SURFACES.includes("rewards")) {
        deviceReport.rewards = await captureRewardsState(page, deviceDir);
      }
      if (SURFACES.includes("chat")) {
        deviceReport.chat = await captureChatState(page, deviceDir);
      }
      if (SURFACES.includes("settings")) {
        deviceReport.settings = await captureSettingsHomeState(page, deviceDir);
      }
      if (SURFACES.includes("financial-profile")) {
        deviceReport.financialProfile = await captureFinancialProfileState(page, deviceDir);
      }
      if (SURFACES.includes("backup")) {
        deviceReport.backup = await captureBackupState(page, deviceDir);
      }

      deviceReport.consoleErrors = Array.from(new Set(consoleErrors));
      report.devices[device.id] = deviceReport;
    } finally {
      await context.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));

  const summary = Object.entries(report.devices).map(([deviceId, deviceReport]) => ({
    device: deviceId,
    dashboard: maxOverflow(deviceReport.dashboard),
    auditHome: maxOverflow(deviceReport.audit?.home),
    auditComposer: maxOverflow(deviceReport.audit?.composer),
    bills: maxOverflow(deviceReport.bills),
    budget: maxOverflow(deviceReport.budget),
    vault: maxOverflow(deviceReport.vault),
    rewardsHome: maxOverflow(deviceReport.rewards?.home),
    rewardsResult: maxOverflow(deviceReport.rewards?.result),
    chatEmpty: maxOverflow(deviceReport.chat?.empty),
    chatHistory: maxOverflow(deviceReport.chat?.history),
    settings: maxOverflow(deviceReport.settings),
    financialProfile: maxOverflow(deviceReport.financialProfile),
    backup: maxOverflow(deviceReport.backup),
    consoleErrors: deviceReport.consoleErrors.length,
  }));

  console.table(summary);
  console.log(`Saved visual QA artifacts to ${OUTPUT_DIR}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
