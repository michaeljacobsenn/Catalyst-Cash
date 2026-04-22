import { stripPaycheckParens } from "../utils.js";

export interface DashboardNextAction {
  clean: string;
  headline: string;
  detail: string;
  amountMatch: string | null;
  label: string;
}

export function splitDashboardSentences(text: string | null | undefined): string[] {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function buildDashboardNextAction(text: string | null | undefined): DashboardNextAction | null {
  const clean = stripPaycheckParens(String(text || "")).replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const sentences = splitDashboardSentences(clean);
  const headline = sentences[0] || clean;
  const detail = sentences.slice(1).join(" ");
  const amountMatch =
    (headline.match(/\$[\d,]+(?:\.\d{1,2})?/) || detail.match(/\$[\d,]+(?:\.\d{1,2})?/))?.[0] || null;

  const label = /^route\b/i.test(headline)
    ? "Route now"
    : /^protect\b/i.test(headline)
      ? "Protect cash"
      : /^pause\b/i.test(headline)
        ? "Pause move"
        : "Best next move";

  return { clean, headline, detail, amountMatch, label };
}

export function normalizeDashboardStatus(status: string | null | undefined): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" {
  const rawStatus = String(status || "UNKNOWN").toUpperCase();
  if (rawStatus.includes("GREEN")) return "GREEN";
  if (rawStatus.includes("RED")) return "RED";
  if (rawStatus.includes("YELLOW")) return "YELLOW";
  return "UNKNOWN";
}

export function computeScorePercentile(score: number): number {
  if (score === 0) return 0;
  const z = (score - 62) / 16;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const phi = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.round(z > 0 ? (1 - phi) * 100 : phi * 100);
}
