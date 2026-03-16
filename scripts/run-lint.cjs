#!/usr/bin/env node

const { ESLint } = require("eslint");

const targets = [
  "src",
  "worker/src",
  "scripts",
  "playwright.config.ts",
  "playwright.config.js",
  "eslint.config.js",
];

async function main() {
  const fix = process.argv.includes("--fix");
  const start = Date.now();

  const eslint = new ESLint({
    cache: true,
    cacheLocation: ".eslintcache",
    cacheStrategy: "content",
    fix,
    errorOnUnmatchedPattern: false,
  });

  const results = await eslint.lintFiles(targets);
  if (fix) {
    await ESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);
  if (output) {
    process.stdout.write(output);
  }

  const summary = results.reduce(
    (acc, result) => {
      acc.errors += result.errorCount;
      acc.warnings += result.warningCount;
      return acc;
    },
    { errors: 0, warnings: 0 }
  );

  const seconds = ((Date.now() - start) / 1000).toFixed(2);
  process.stdout.write(`\nESLint checked ${results.length} file(s) in ${seconds}s.\n`);

  process.exit(summary.errors > 0 || summary.warnings > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
