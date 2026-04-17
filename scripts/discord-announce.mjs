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
    headline: "Weekly briefings are clearer and easier to trust.",
    highlights: [
      "**Results open cleaner.** The first screen now does a better job surfacing the score, status, and what matters most right away.",
      "**Fallbacks feel more trustworthy.** When the model returns a thinner response, Catalyst rebuilds the important pieces more gracefully.",
      "**Weekly actions are easier to follow.** Next steps and move planning are labeled more clearly and stay easier to read.",
    ],
    match: (entry) => /worker\/src\/index\.js|audit|resultsview|resultsview\/|auditcontext|auditoutputcontract|evaluate-audit-models|buildsnapshotmessage|utils\.js/i.test(entry),
  },
  {
    key: "portfolio",
    headline: "Accounts and balances behave more cleanly.",
    highlights: [
      "**Linked and manual records play nicer.** Duplicate handling and overlap logic are more deliberate.",
      "**Portfolio setup feels safer.** Mixed source accounts are less likely to create confusing balance states.",
      "**Audit inputs stay cleaner.** Included accounts and balances behave more consistently across account types.",
    ],
    match: (entry) => /plaid|portfolio|investmentholdings|cardportfoliotab|inputform|duplicate/i.test(entry),
  },
  {
    key: "trust",
    headline: "Recovery and continuity are easier to trust.",
    highlights: [
      "**Restore paths are clearer.** Backup, restore, and continuity flows are easier to understand.",
      "**Cross-device recovery is safer.** State reconciliation behaves more deliberately when devices reconnect.",
      "**Trust surfaces feel tighter.** Security and continuity messaging is more aligned with how the product actually works.",
    ],
    match: (entry) => /recovery|backup|icloud|identity|security|trust|sync/i.test(entry),
  },
  {
    key: "ux",
    headline: "Core flows feel smoother and more complete.",
    highlights: [
      "**Navigation feels calmer.** The app shell is more polished and easier to scan.",
      "**Empty and edge states feel less rough.** Setup, history, and transition moments land more cleanly.",
      "**The product feels more finished.** A number of small friction points were tightened across core flows.",
    ],
    match: (entry) => /setupwizard|pagepass|pageimport|appshell|offline|historytab|bottomnavbar|dashboard|aichat|settings|ui\.tsx/i.test(entry),
  },
  {
    key: "site",
    headline: "The product story is tighter across the site and guides.",
    highlights: [
      "**Website copy is clearer.** Messaging now reflects the product more accurately.",
      "**Guides feel more consistent.** Key onboarding and help surfaces are easier to follow.",
      "**Pricing and trust language are cleaner.** The public-facing story is more focused and less noisy.",
    ],
    match: (entry) => /site\/|guide|faq|security\.html|privacy\.html|compare\.html|index\.html|style\.css/i.test(entry),
  },
  {
    key: "ops",
    headline: "Smaller stability and polish improvements shipped behind the scenes.",
    highlights: [
      "**General polish improved.** Internal release work reduced rough edges without changing your workflow.",
      "**Stability is tighter.** Supporting systems were cleaned up to make the product feel more dependable.",
      "**Delivery got cleaner.** Release notes and launch tooling now communicate updates more clearly.",
    ],
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
          score: 0,
        });
      }
      const bucket = seeded.get(category.key);
      bucket.score += entry.type === "file" ? 2 : 1;
    }
  }

  if (seeded.size === 0) {
    const fallback = CATEGORY_DEFS.find((entry) => entry.key === "ops");
    if (fallback) {
      seeded.set(fallback.key, {
        ...fallback,
        score: 1,
      });
    }
  }

  const order = new Map(CATEGORY_DEFS.map((entry, index) => [entry.key, index]));
  return Array.from(seeded.values()).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return (order.get(left.key) || 0) - (order.get(right.key) || 0);
  });
}

function buildDescription(categories) {
  if (categories.length === 0) return "A smaller polish update shipped.";
  return categories[0].headline;
}

function buildHighlights(categories) {
  if (categories.length === 0) {
    return ["• **General polish.** Smaller reliability and presentation improvements shipped across the product."];
  }

  const [primary, ...rest] = categories;
  const bullets = [];

  const pushUnique = (value) => {
    const cleaned = cleanSubject(String(value || ""));
    if (!cleaned) return;
    if (bullets.includes(`• ${cleaned}`)) return;
    bullets.push(`• ${cleaned}`);
  };

  if (categories.length === 1) {
    primary.highlights.slice(0, 3).forEach(pushUnique);
    return bullets.slice(0, 3);
  }

  pushUnique(primary.highlights[0]);
  rest.slice(0, 2).forEach((category) => pushUnique(category.highlights[0]));

  if (bullets.length < 4) {
    pushUnique(primary.highlights[1]);
  }

  return bullets.slice(0, 4);
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

function buildPayload({ commitDate, commits, files }) {
  const categories = collectCategories(commits, files);
  const title = versionLabel || "Catalyst Cash update";
  const description = buildDescription(categories);
  const fields = [
    {
      name: "What changed",
      value: buildHighlights(categories).join("\n"),
      inline: false,
    },
  ];

  return {
    username: "Catalyst Cash",
    embeds: [
      {
        title,
        description,
        color: 0x6d8ed9,
        fields,
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
  const commitDate = commits[commits.length - 1]?.date || new Date().toISOString();

  const payload = buildPayload({
    commitDate,
    commits,
    files,
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
