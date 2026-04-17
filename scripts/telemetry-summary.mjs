#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const defaultApiUrl = process.env.CATALYST_API_URL || "https://api.catalystcash.app";
const adminToken = process.env.ADMIN_TOKEN || "";
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const saveFlag = process.argv.includes("--save");
const days = Math.min(Math.max(Number(daysArg ? daysArg.slice(7) : process.argv[2] || 14) || 14, 1), 90);
const outputPath = outArg ? path.resolve(outArg.slice(6)) : path.resolve("docs/telemetry-summary-latest.md");

if (!adminToken) {
  console.error("Missing ADMIN_TOKEN. Usage: ADMIN_TOKEN=... npm run telemetry:summary -- --days=14");
  process.exit(1);
}

const endpoint = `${defaultApiUrl.replace(/\/$/, "")}/api/admin/telemetry-summary?days=${days}`;

function formatRate(value) {
  return value == null ? "n/a" : `${(Number(value) * 100).toFixed(1)}%`;
}

function toMarkdown(payload) {
  const lines = [
    `# Telemetry Summary`,
    ``,
    `Window: last ${payload.days} day(s)`,
    `Generated at: ${payload.generatedAt}`,
    `Status: ${payload.status || "ok"}`,
    ``,
    `## Totals`,
    ``,
    `- Funnel events: ${payload.totals?.funnelEvents ?? 0}`,
    `- Support-risk events: ${payload.totals?.supportEvents ?? 0}`,
    `- Unique devices: ${payload.totals?.uniqueDevices ?? 0}`,
    ``,
    `## Insights`,
    ``,
    ...(payload.insights?.recommendations?.length
      ? payload.insights.recommendations.map((line) => `- ${line}`)
      : [`- No insights available.`]),
  ];

  if (Array.isArray(payload.progression) && payload.progression.length > 0) {
    lines.push(
      "",
      "## Funnel Progression",
      "",
      "| Stage | Unique Devices | Retained From Previous | Rate From Previous | Rate From Start |",
      "| --- | ---: | ---: | ---: | ---: |"
    );
    for (const row of payload.progression) {
      lines.push(
        `| ${row.event} | ${row.uniqueDevices} | ${row.retainedFromPrevious ?? "n/a"} | ${formatRate(row.rateFromPrevious)} | ${formatRate(row.rateFromStart)} |`
      );
    }
  }

  if (Array.isArray(payload.support) && payload.support.length > 0) {
    lines.push("", "## Support Risks", "", "| Event | Unique Devices | Total Events |", "| --- | ---: | ---: |");
    for (const row of payload.support) {
      lines.push(`| ${row.event} | ${row.uniqueDevices} | ${row.totalEvents} |`);
    }
  }

  return `${lines.join("\n")}\n`;
}

try {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  console.log(`Telemetry summary for the last ${payload.days} day(s)`);
  console.log(`Generated at: ${payload.generatedAt}`);
  console.log(`Status: ${payload.status || "ok"}`);
  console.log("");
  console.table([payload.totals]);

  if (payload.insights?.recommendations?.length) {
    console.log("\nInsights");
    for (const line of payload.insights.recommendations) {
      console.log(`- ${line}`);
    }
  }

  if (Array.isArray(payload.progression) && payload.progression.length > 0) {
    console.log("\nProgression");
    console.table(
      payload.progression.map((row) => ({
        stage: row.event,
        uniqueDevices: row.uniqueDevices,
        retainedFromPrevious: row.retainedFromPrevious ?? "n/a",
        rateFromPrevious: formatRate(row.rateFromPrevious),
        rateFromStart: formatRate(row.rateFromStart),
      }))
    );
  }

  if (Array.isArray(payload.funnel) && payload.funnel.length > 0) {
    console.log("\nTop funnel events");
    console.table(payload.funnel);
  }

  if (Array.isArray(payload.support) && payload.support.length > 0) {
    console.log("\nSupport-risk events");
    console.table(payload.support);
  }

  if (saveFlag || outArg) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, toMarkdown(payload), "utf8");
    console.log(`\nSaved markdown summary to ${outputPath}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
