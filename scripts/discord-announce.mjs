#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const cwd = process.cwd();
const args = process.argv.slice(2);

const flagValue = (name) => {
  const prefix = `--${name}=`;
  const exactIndex = args.indexOf(`--${name}`);
  if (exactIndex >= 0) return args[exactIndex + 1] || "";
  const inline = args.find((entry) => entry.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : "";
};

const hasFlag = (name) => args.includes(`--${name}`);

const webhookUrl = flagValue("webhook") || process.env.DISCORD_ANNOUNCEMENTS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL || "";
const dryRun = hasFlag("dry-run");
const toRefInput = flagValue("to") || "HEAD";
const fromRefInput = flagValue("from") || "";
const versionLabel = flagValue("version") || "";
const stateFile = path.join(cwd, ".git", "catalyst-discord-announce.json");

const CATEGORY_DEFS = [
  {
    key: "audit",
    title: "Audit engine & results",
    summary: "Audit outputs are more resilient and more readable, with stronger fallback handling, tighter normalization, and clearer weekly action planning.",
    match: (entry) => /worker\/src\/index\.js|audit|resultsview|resultsview\/|auditcontext|auditoutputcontract|evaluate-audit-models|buildsnapshotmessage|utils\.js/i.test(entry),
  },
  {
    key: "portfolio",
    title: "Accounts, Plaid & portfolio",
    summary: "Portfolio logic is safer around duplicates, manual-versus-linked overlaps, deleted entries, and mixed account-source setups.",
    match: (entry) => /plaid|portfolio|investmentholdings|cardportfoliotab|inputform|duplicate/i.test(entry),
  },
  {
    key: "trust",
    title: "Recovery, sync & trust",
    summary: "Recovery and sync flows are more deliberate, with clearer continuity handling and safer state reconciliation across devices.",
    match: (entry) => /recovery|backup|icloud|identity|security|trust|sync/i.test(entry),
  },
  {
    key: "ux",
    title: "Setup, shell & UX polish",
    summary: "Core product surfaces feel calmer and more complete, especially around setup, shell states, offline handling, and navigation clarity.",
    match: (entry) => /setupwizard|pagepass|pageimport|appshell|offline|historytab|bottomnavbar|dashboard|aichat|settings|ui\.tsx/i.test(entry),
  },
  {
    key: "site",
    title: "Website, guides & messaging",
    summary: "The public-facing product story is tighter and more consistent across the site, guides, pricing language, and trust copy.",
    match: (entry) => /site\/|guide|faq|security\.html|privacy\.html|compare\.html|index\.html|style\.css/i.test(entry),
  },
  {
    key: "ops",
    title: "Release tooling & operations",
    summary: "Release tooling is cleaner and more production-friendly, with better operational checks, summaries, and launch workflows.",
    match: (entry) => /scripts\/|workflow|telemetry|package\.json|readme|deploy|wrangler/i.test(entry),
  },
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function resolveCommit(ref) {
  if (!ref) return "";
  try {
    return git(["rev-parse", ref]);
  } catch {
    return "";
  }
}

async function readStateCommit() {
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed?.lastAnnouncedCommit === "string" ? parsed.lastAnnouncedCommit : "";
  } catch {
    return "";
  }
}

function cleanSubject(subject) {
  return String(subject || "")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizePath(file) {
  const cleaned = String(file || "").replace(/^src\/modules\//, "").replace(/^worker\/src\//, "worker/");
  const tail = cleaned.split("/").slice(-2).join("/");
  return tail.replace(/\.(tsx?|jsx?|mjs|cjs|js|html|css)$/i, "").replace(/[-_]/g, " ");
}

function formatCompareLabel(fromSubject, toSubject) {
  if (fromSubject && toSubject) {
    return `Compared with “${fromSubject},” this update centers on ${toSubject.toLowerCase()}.`;
  }
  if (toSubject) return `Latest update: ${toSubject}.`;
  return "Latest Catalyst Cash update.";
}

function collectCategories(commits, files) {
  const seeded = new Map();
  const combinedInputs = [
    ...files.map((file) => ({ type: "file", value: file })),
    ...commits.flatMap((commit) => [commit.subject, commit.body].filter(Boolean).map((value) => ({ type: "text", value }))),
  ];

  for (const entry of combinedInputs) {
    for (const category of CATEGORY_DEFS) {
      if (!category.match(entry.value)) continue;
      if (!seeded.has(category.key)) {
        seeded.set(category.key, {
          ...category,
          files: new Set(),
          subjects: new Set(),
        });
      }
      const bucket = seeded.get(category.key);
      if (entry.type === "file") bucket.files.add(entry.value);
      if (entry.type === "text") {
        const subject = cleanSubject(entry.value);
        if (subject) bucket.subjects.add(subject);
      }
    }
  }

  if (seeded.size === 0) {
    const fallback = CATEGORY_DEFS.find((entry) => entry.key === "ops");
    if (fallback) {
      seeded.set(fallback.key, {
        ...fallback,
        files: new Set(files),
        subjects: new Set(commits.map((commit) => cleanSubject(commit.subject)).filter(Boolean)),
      });
    }
  }

  return Array.from(seeded.values()).map((category) => {
    const fileList = Array.from(category.files).slice(0, 3).map(humanizePath);
    const subjectList = Array.from(category.subjects).slice(0, 2);
    const evidenceBits = [];
    if (fileList.length > 0) evidenceBits.push(`Scope: ${fileList.join(", ")}`);
    if (subjectList.length > 0) evidenceBits.push(`Recent work: ${subjectList.join(" • ")}`);
    return {
      title: category.title,
      value: [category.summary, ...evidenceBits].join("\n"),
    };
  });
}

function summarizeDiff(commits, files, shortStat) {
  const commitCount = commits.length;
  const fileCount = files.length;
  const fileLabel = fileCount === 1 ? "file" : "files";
  const commitLabel = commitCount === 1 ? "commit" : "commits";
  const statLine = shortStat ? shortStat.replace(/\s+/g, " ").trim() : "No file-level diff summary available.";
  return `${commitCount} ${commitLabel} across ${fileCount} ${fileLabel}. ${statLine}`;
}

async function writeState(lastAnnouncedCommit, fromCommit) {
  await fs.writeFile(
    stateFile,
    JSON.stringify(
      {
        lastAnnouncedCommit,
        fromCommit,
        announcedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function buildPayload({ fromCommit, toCommit, fromSubject, toSubject, commitDate, commits, files, shortStat }) {
  const shortFrom = fromCommit.slice(0, 7);
  const shortTo = toCommit.slice(0, 7);
  const title = versionLabel || `Catalyst Cash update • ${shortTo}`;
  const description = formatCompareLabel(fromSubject, toSubject);
  const fields = [
    {
      name: "Update delta",
      value: summarizeDiff(commits, files, shortStat),
      inline: false,
    },
    ...collectCategories(commits, files).slice(0, 4).map((entry) => ({
      name: entry.title,
      value: entry.value.slice(0, 1024),
      inline: false,
    })),
  ];

  return {
    username: "Catalyst Cash",
    embeds: [
      {
        title,
        description,
        color: 0x00ff88,
        fields,
        footer: {
          text: `Compared ${shortFrom} → ${shortTo}`,
        },
        timestamp: commitDate,
      },
    ],
  };
}

async function main() {
  const toCommit = resolveCommit(toRefInput);
  if (!toCommit) {
    throw new Error(`Unable to resolve target ref "${toRefInput}".`);
  }

  const stateCommit = fromRefInput ? "" : await readStateCommit();
  const baseRef = fromRefInput || stateCommit || "HEAD^";
  const fromCommit = resolveCommit(baseRef);
  if (!fromCommit) {
    throw new Error(`Unable to resolve baseline ref "${baseRef}".`);
  }
  if (fromCommit === toCommit) {
    throw new Error("No new commit range to announce.");
  }

  const commitsRaw = git(["log", "--reverse", "--format=%H%x1f%s%x1f%b%x1f%ad%x1e", "--date=iso-strict", `${fromCommit}..${toCommit}`]);
  const commits = commitsRaw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject, body, date] = entry.split("\x1f");
      return {
        hash,
        subject: cleanSubject(subject),
        body: cleanSubject(body),
        date: cleanSubject(date),
      };
    });

  if (commits.length === 0) {
    throw new Error("No commits found in the selected range.");
  }

  const files = git(["diff", "--name-only", `${fromCommit}..${toCommit}`])
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const shortStat = git(["diff", "--shortstat", `${fromCommit}..${toCommit}`]);
  const fromSubject = cleanSubject(git(["log", "--format=%s", "-1", fromCommit]));
  const toSubject = cleanSubject(git(["log", "--format=%s", "-1", toCommit]));
  const commitDate = commits[commits.length - 1]?.date || new Date().toISOString();

  const payload = buildPayload({
    fromCommit,
    toCommit,
    fromSubject,
    toSubject,
    commitDate,
    commits,
    files,
    shortStat,
  });

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!webhookUrl) {
    throw new Error("Missing DISCORD_ANNOUNCEMENTS_WEBHOOK or --webhook.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord webhook failed (${response.status}): ${body || "No response body"}`);
  }

  await writeState(toCommit, fromCommit);
  console.log(`Posted Discord announcement for ${toCommit.slice(0, 7)} (from ${fromCommit.slice(0, 7)}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
