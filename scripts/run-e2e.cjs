#!/usr/bin/env node

const net = require("node:net");
const { spawnSync } = require("node:child_process");

const cwd = process.cwd();
const extraArgs = process.argv.slice(2);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 4273;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function main() {
  const port = await getFreePort();
  const env = { ...process.env, PW_TEST_PORT: String(port) };
  const steps = [
    ["node", ["./node_modules/vite/bin/vite.js", "build"]],
    ["node", ["./node_modules/playwright/cli.js", "test", "--config=playwright.config.ts", ...extraArgs]],
  ];

  for (const [command, args] of steps) {
    const result = spawnSync(command, args, {
      cwd,
      stdio: "inherit",
      env,
    });

    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }

    if ((result.status ?? 1) !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
