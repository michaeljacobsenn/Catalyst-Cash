#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const strict = process.argv.includes("--strict");
const cwd = process.cwd();
const migrationsDir = path.join(cwd, "worker", "migrations");
const databaseName = process.env.D1_DATABASE || "catalyst-cash-db";

async function loadLocalMigrations() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function loadRemoteMigrations() {
  const { stdout } = await execFileAsync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--json",
      "--command",
      "SELECT name FROM d1_migrations ORDER BY id;",
    ],
    { cwd }
  );
  const payload = JSON.parse(stdout);
  return (payload?.[0]?.results || [])
    .map((row) => String(row?.name || "").trim())
    .filter(Boolean);
}

try {
  const [localMigrations, remoteMigrations] = await Promise.all([
    loadLocalMigrations(),
    loadRemoteMigrations(),
  ]);

  const remoteSet = new Set(remoteMigrations);
  const pending = localMigrations.filter((name) => !remoteSet.has(name));

  console.log(`Remote D1 migration status for ${databaseName}`);
  console.log(`Applied remotely: ${remoteMigrations.length}`);
  console.log(`Present locally: ${localMigrations.length}`);

  if (pending.length === 0) {
    console.log("\nRemote database is up to date with local migrations.");
    process.exit(0);
  }

  console.log("\nPending remote migrations:");
  for (const name of pending) {
    console.log(`- ${name}`);
  }

  if (strict) {
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
