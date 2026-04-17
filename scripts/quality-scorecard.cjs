#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOTS = ["src", "worker"];
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const THRESHOLDS = {
  maxFilesOver500: 20,
  maxFilesOver800: 8,
  maxFilesOver1000: 4,
  maxFilesOver1500: 0,
  maxExplicitAny: 5,
  maxSuppressionComments: 2,
  maxBannerComments: 0,
  maxTodoMarkers: 0,
  minTestToProdRatio: 0.35,
};

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (isCodeFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function createMetrics(files) {
  const metrics = {
    totalFiles: files.length,
    prodFiles: 0,
    testFiles: 0,
    filesOver500: 0,
    filesOver800: 0,
    filesOver1000: 0,
    filesOver1500: 0,
    explicitAny: 0,
    suppressionComments: 0,
    bannerComments: 0,
    todoMarkers: 0,
    hotspots: [],
  };

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split("\n").length;
    const relativePath = path.relative(process.cwd(), filePath);
    const isTestFile = /\.test\./.test(path.basename(filePath));

    if (isTestFile) {
      metrics.testFiles += 1;
    } else {
      metrics.prodFiles += 1;
    }

    if (lines > 500) metrics.filesOver500 += 1;
    if (lines > 800) metrics.filesOver800 += 1;
    if (lines > 1000) metrics.filesOver1000 += 1;
    if (lines > 1500) metrics.filesOver1500 += 1;

    if (!isTestFile && /\.(ts|tsx)$/.test(filePath)) {
      metrics.explicitAny += countMatches(text, /\bany\b/g);
    }

    if (!isTestFile) {
      metrics.suppressionComments += countMatches(text, /@ts-ignore|@ts-expect-error|eslint-disable/g);
      metrics.bannerComments += countMatches(text, /^\s*(?:\/\/|\/\*+|\*)\s*[═-]{6,}/gm);
      metrics.todoMarkers += countMatches(text, /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/g);
    }

    metrics.hotspots.push({ path: relativePath, lines });
  }

  metrics.hotspots.sort((left, right) => right.lines - left.lines);
  metrics.hotspots = metrics.hotspots.slice(0, 15);
  metrics.testToProdRatio = metrics.prodFiles > 0
    ? Number((metrics.testFiles / metrics.prodFiles).toFixed(2))
    : 0;

  return metrics;
}

function buildStatus(metrics) {
  return {
    filesOver500: metrics.filesOver500 <= THRESHOLDS.maxFilesOver500 ? "pass" : "fail",
    filesOver800: metrics.filesOver800 <= THRESHOLDS.maxFilesOver800 ? "pass" : "fail",
    filesOver1000: metrics.filesOver1000 <= THRESHOLDS.maxFilesOver1000 ? "pass" : "fail",
    filesOver1500: metrics.filesOver1500 <= THRESHOLDS.maxFilesOver1500 ? "pass" : "fail",
    explicitAny: metrics.explicitAny <= THRESHOLDS.maxExplicitAny ? "pass" : "fail",
    suppressionComments: metrics.suppressionComments <= THRESHOLDS.maxSuppressionComments ? "pass" : "fail",
    bannerComments: metrics.bannerComments <= THRESHOLDS.maxBannerComments ? "pass" : "fail",
    todoMarkers: metrics.todoMarkers <= THRESHOLDS.maxTodoMarkers ? "pass" : "fail",
    testToProdRatio: metrics.testToProdRatio >= THRESHOLDS.minTestToProdRatio ? "pass" : "fail",
  };
}

function printHumanReport(report) {
  console.log("Quality Scorecard");
  console.log("");
  console.log(`Roots: ${report.roots.join(", ")}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log("");
  console.table([
    { metric: "prodFiles", actual: report.metrics.prodFiles, target: "-" },
    { metric: "testFiles", actual: report.metrics.testFiles, target: "-" },
    { metric: "testToProdRatio", actual: report.metrics.testToProdRatio, target: `>= ${THRESHOLDS.minTestToProdRatio}` },
    { metric: "filesOver500", actual: report.metrics.filesOver500, target: `<= ${THRESHOLDS.maxFilesOver500}` },
    { metric: "filesOver800", actual: report.metrics.filesOver800, target: `<= ${THRESHOLDS.maxFilesOver800}` },
    { metric: "filesOver1000", actual: report.metrics.filesOver1000, target: `<= ${THRESHOLDS.maxFilesOver1000}` },
    { metric: "filesOver1500", actual: report.metrics.filesOver1500, target: `<= ${THRESHOLDS.maxFilesOver1500}` },
    { metric: "explicitAny", actual: report.metrics.explicitAny, target: `<= ${THRESHOLDS.maxExplicitAny}` },
    { metric: "suppressionComments", actual: report.metrics.suppressionComments, target: `<= ${THRESHOLDS.maxSuppressionComments}` },
    { metric: "bannerComments", actual: report.metrics.bannerComments, target: `<= ${THRESHOLDS.maxBannerComments}` },
    { metric: "todoMarkers", actual: report.metrics.todoMarkers, target: `<= ${THRESHOLDS.maxTodoMarkers}` },
  ]);

  console.log("Hotspots");
  console.table(report.metrics.hotspots);
}

function main() {
  const files = ROOTS.flatMap((root) => walk(path.join(process.cwd(), root)));
  const metrics = createMetrics(files);
  const report = {
    generatedAt: new Date().toISOString(),
    roots: ROOTS,
    targets: THRESHOLDS,
    metrics,
    status: buildStatus(metrics),
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (process.argv.includes("--check")) {
    const failures = Object.entries(report.status)
      .filter(([, status]) => status === "fail")
      .map(([metric]) => metric);
    if (failures.length > 0) {
      console.error("");
      console.error(`Quality thresholds not met: ${failures.join(", ")}`);
      process.exit(1);
    }
  }
}

main();
