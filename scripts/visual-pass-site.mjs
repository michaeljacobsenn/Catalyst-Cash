import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { chromium, devices } from "playwright";

const BASE_URL =
  process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=")[1] ||
  process.env.VISUAL_SITE_BASE_URL ||
  "http://127.0.0.1:4174/";

const OUTPUT_DIR = path.resolve("output/playwright/visual-pass-site");

const SITE_PAGES = [
  { id: "home", path: "index.html" },
  { id: "compare", path: "compare.html" },
  { id: "faq", path: "faq.html" },
];

const SITE_DEVICES = [
  {
    id: "desktop",
    use: {
      viewport: { width: 1440, height: 1100 },
      isMobile: false,
      hasTouch: false,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    },
  },
  {
    id: "iphone",
    use: {
      ...devices["iPhone 15"],
    },
  },
  {
    id: "ipad",
    use: {
      ...devices["iPad Pro 11"],
    },
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function collectLayoutReport(page) {
  return page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;
    const viewportWidth = window.innerWidth;
    const overflowX = Math.max(
      0,
      body ? body.scrollWidth - viewportWidth : 0,
      doc ? doc.scrollWidth - viewportWidth : 0
    );

    const offenders = [];
    const nodes = Array.from(document.querySelectorAll("body *"));
    for (const node of nodes) {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const spill = Math.max(0, rect.right - viewportWidth);
      if (spill < 2) continue;
      offenders.push({
        tag: node.tagName.toLowerCase(),
        className: String(node.className || "").trim().slice(0, 120),
        text: String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        spill: Number(spill.toFixed(2)),
      });
      if (offenders.length >= 8) break;
    }

    return { overflowX, offenders };
  });
}

async function capturePage(context, deviceId, sitePage) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(cleanText(message.text()));
  });
  page.on("pageerror", (error) => {
    pageErrors.push(cleanText(error?.message || error));
  });

  const url = new URL(sitePage.path, BASE_URL).toString();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);

  const layout = await collectLayoutReport(page);
  const screenshotPath = path.join(OUTPUT_DIR, deviceId, `${sitePage.id}.png`);
  ensureDir(path.dirname(screenshotPath));
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await page.close();

  return {
    url,
    screenshot: screenshotPath,
    overflowX: layout.overflowX,
    offenders: layout.offenders,
    consoleErrors,
    pageErrors,
  };
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    devices: {},
  };

  try {
    for (const device of SITE_DEVICES) {
      const context = await browser.newContext(device.use);
      const deviceReport = {};
      for (const sitePage of SITE_PAGES) {
        deviceReport[sitePage.id] = await capturePage(context, device.id, sitePage);
      }
      report.devices[device.id] = deviceReport;
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const summary = {
    maxOverflow: 0,
    totalConsoleErrors: 0,
    totalPageErrors: 0,
  };

  for (const deviceReport of Object.values(report.devices)) {
    for (const pageReport of Object.values(deviceReport)) {
      summary.maxOverflow = Math.max(summary.maxOverflow, pageReport.overflowX || 0);
      summary.totalConsoleErrors += pageReport.consoleErrors?.length || 0;
      summary.totalPageErrors += pageReport.pageErrors?.length || 0;
    }
  }

  report.summary = summary;
  fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
