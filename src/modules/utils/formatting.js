import { formatCurrency } from "../currency.js";

export const fmt = (value) => formatCurrency(value);

export const fmtDate = (value) => {
  if (!value) return "—";

  try {
    const parts = String(value).split(/[T\s]/)[0].split("-");
    if (parts.length !== 3) {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }

    const [year, month, day] = parts.map(Number);
    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return String(value);
  }
};

export const stripPaycheckParens = (text) => {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => line.replace(/^(Pre-Paycheck|Post-Paycheck)\s*\([^)]*\)/i, "$1"))
    .join("\n");
};

export function advanceExpiredDate(
  dateString,
  intervalAmount,
  intervalUnit,
  todayString = new Date().toISOString().split("T")[0]
) {
  if (!dateString) return dateString;
  if (dateString >= todayString) return dateString;

  const date = new Date(`${dateString}T12:00:00Z`);
  const today = new Date(`${todayString}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;

  const amount = Number(intervalAmount) || 1;

  if (intervalUnit === "days") {
    const dayDelta = Math.ceil((today - date) / (1000 * 60 * 60 * 24));
    const intervals = Math.ceil(dayDelta / amount);
    date.setUTCDate(date.getUTCDate() + intervals * amount);
  } else if (intervalUnit === "weeks") {
    const dayDelta = Math.ceil((today - date) / (1000 * 60 * 60 * 24));
    const intervals = Math.ceil(dayDelta / (amount * 7));
    date.setUTCDate(date.getUTCDate() + intervals * amount * 7);
  } else if (intervalUnit === "years" || intervalUnit === "yearly" || intervalUnit === "annual") {
    const yearDelta = today.getUTCFullYear() - date.getUTCFullYear();
    const intervals = Math.max(1, Math.ceil(yearDelta / amount));
    date.setUTCFullYear(date.getUTCFullYear() + intervals * amount);
    if (date < today) date.setUTCFullYear(date.getUTCFullYear() + amount);
  } else {
    const yearDelta = today.getUTCFullYear() - date.getUTCFullYear();
    const monthDelta = yearDelta * 12 + (today.getUTCMonth() - date.getUTCMonth());
    const intervals = Math.max(1, Math.ceil(monthDelta / amount));
    const originalDay = date.getUTCDate();
    date.setUTCMonth(date.getUTCMonth() + intervals * amount);
    if (date.getUTCDate() < originalDay) date.setUTCDate(0);
    if (date < today) {
      const nextOriginalDay = date.getUTCDate();
      date.setUTCMonth(date.getUTCMonth() + amount);
      if (date.getUTCDate() < nextOriginalDay) date.setUTCDate(0);
    }
  }

  return date.toISOString().split("T")[0];
}

export function parseCurrency(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const stringValue = String(value).trim();
  const isNegative = stringValue.startsWith("-") || (stringValue.startsWith("(") && stringValue.endsWith(")"));
  const cleanValue = stringValue.replace(/[^0-9.]+/g, "");
  if (!cleanValue) return null;

  let numericValue = parseFloat(cleanValue);
  if (isNegative) numericValue = -numericValue;
  return Number.isFinite(numericValue) ? numericValue : null;
}
