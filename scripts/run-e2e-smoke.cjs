#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const HOST = "127.0.0.1";
const BACKEND_HOST_PATTERN = /https:\/\/(?:api\.catalystcash\.app|catalyst-cash-api\.portfoliopro-app\.workers\.dev)/;

const CORE_JOURNEY_SEED = {
  "onboarding-complete": true,
  "audit-history": [],
  "current-audit": null,
  "move-states": {},
  "financial-config": {
    payFrequency: "bi-weekly",
    payday: "Friday",
    paycheckStandard: 3200,
    paycheckFirstOfMonth: 2800,
    weeklySpendAllowance: 425,
    emergencyFloor: 1200,
    currencyCode: "USD",
  },
};

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const normalized = requestPath === "/" ? "/index.html" : requestPath;
      const filePath = path.join(DIST_DIR, normalized);
      const safePath = filePath.startsWith(DIST_DIR) ? filePath : path.join(DIST_DIR, "index.html");

      let finalPath = safePath;
      if (!fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) {
        finalPath = path.join(DIST_DIR, "index.html");
      }

      fs.readFile(finalPath, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": contentType(finalPath) });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(0, HOST, () => resolve(server));
  });
}

async function waitVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
  if (!(await locator.isVisible())) {
    throw new Error(`${label} was not visible`);
  }
}

async function runSmoke() {
  const build = spawnSync("node", ["./node_modules/vite/bin/vite.js", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if ((build.status ?? 1) !== 0) {
    process.exit(build.status ?? 1);
  }

  const server = await startStaticServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 4173;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: `http://${HOST}:${port}` });
  const page = await context.newPage();

  try {
    await page.route(new RegExp(`${BACKEND_HOST_PATTERN.source}/config$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ gatingMode: "off" }),
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      });
    });

    await page.route(new RegExp(`${BACKEND_HOST_PATTERN.source}/market(?:\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prices: {} }),
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      });
    });

    await page.addInitScript((seed) => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      for (const [key, value] of Object.entries(seed)) {
        const serialized = JSON.stringify(value);
        window.localStorage.setItem(key, serialized);
        window.localStorage.setItem(`CapacitorStorage.${key}`, serialized);
      }
    }, CORE_JOURNEY_SEED);

    await page.goto("/");

    await waitVisible(page.getByRole("button", { name: "Open Settings" }), "Open Settings");
    await waitVisible(page.getByRole("tab", { name: "Home", selected: true }), "Home tab");
    await waitVisible(page.getByRole("heading", { name: "Dashboard" }).first(), "Dashboard heading");

    await page.getByRole("button", { name: /Begin.*audit|Run.*audit/i }).first().click();

    await waitVisible(page.getByRole("spinbutton", { name: "Checking balance" }), "Checking balance input");
    await waitVisible(page.getByLabel(/Notes for this/i), "Notes field");

    process.stdout.write("Smoke E2E passed: dashboard boot -> new audit overlay.\n");
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

runSmoke().catch((error) => {
  console.error(error);
  process.exit(1);
});
