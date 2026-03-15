#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const cwd = process.cwd();
const extraArgs = process.argv.slice(2);

const steps = [
  ["node", ["./node_modules/vite/bin/vite.js", "build"]],
  ["node", ["./node_modules/playwright/cli.js", "test", "--config=playwright.config.ts", ...extraArgs]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
