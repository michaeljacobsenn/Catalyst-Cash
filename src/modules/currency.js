// ═══════════════════════════════════════════════════════════════
// CURRENCY CONFIG — Multi-currency formatting and symbol support
// ═══════════════════════════════════════════════════════════════
// The user's selected currency is stored as an ISO 4217 code
// (e.g. "USD", "EUR", "GBP") in financialConfig.currencyCode.
// Default is "USD" if not set.
// ═══════════════════════════════════════════════════════════════

const RAW_CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", flag: "🇬🇧" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-CA", flag: "🇨🇦" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-AU", flag: "🇦🇺" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", locale: "ja-JP", flag: "🇯🇵", decimals: 0 },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", locale: "de-CH", flag: "🇨🇭" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", locale: "zh-CN", flag: "🇨🇳" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN", flag: "🇮🇳" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", locale: "es-MX", flag: "🇲🇽" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", locale: "pt-BR", flag: "🇧🇷" },
  { code: "KRW", symbol: "₩", name: "South Korean Won", locale: "ko-KR", flag: "🇰🇷", decimals: 0 },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", locale: "en-SG", flag: "🇸🇬" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", locale: "en-HK", flag: "🇭🇰" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", locale: "sv-SE", flag: "🇸🇪" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", locale: "nb-NO", flag: "🇳🇴" },
  { code: "DKK", symbol: "kr", name: "Danish Krone", locale: "da-DK", flag: "🇩🇰" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", locale: "en-NZ", flag: "🇳🇿" },
  { code: "ZAR", symbol: "R", name: "South African Rand", locale: "en-ZA", flag: "🇿🇦" },
  { code: "PLN", symbol: "zł", name: "Polish Złoty", locale: "pl-PL", flag: "🇵🇱" },
  { code: "THB", symbol: "฿", name: "Thai Baht", locale: "th-TH", flag: "🇹🇭" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira", locale: "tr-TR", flag: "🇹🇷" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel", locale: "he-IL", flag: "🇮🇱" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", locale: "ar-AE", flag: "🇦🇪" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso", locale: "en-PH", flag: "🇵🇭" },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar", locale: "zh-TW", flag: "🇹🇼" },
  { code: "COP", symbol: "COL$", name: "Colombian Peso", locale: "es-CO", flag: "🇨🇴", decimals: 0 },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", locale: "en-NG", flag: "🇳🇬" },
];

export const CURRENCIES = RAW_CURRENCIES.map(currency => ({
  ...currency,
  label: `${currency.code} (${currency.symbol})`,
}));

const _currencyMap = {};
for (const c of CURRENCIES) _currencyMap[c.code] = c;

/**
 * Get the current currency code from the global config.
 * Falls back to "USD" if not set.
 */
export function getActiveCurrencyCode() {
  return window.__currencyCode || "USD";
}

/**
 * Set the active currency code globally (called from SettingsContext).
 */
export function setActiveCurrencyCode(code) {
  window.__currencyCode = code || "USD";
}

/**
 * Get the full currency config object for a given code.
 */
export function getCurrency(code) {
  return _currencyMap[code] || _currencyMap["USD"];
}

/**
 * Format a number as the active currency.
 * Handles privacy mode masking.
 * @param {number} n - Amount to format
 * @param {object} [options] - Override options
 * @param {string} [options.code] - Currency code override
 * @returns {string} Formatted amount
 */
export function formatCurrency(n, options = {}) {
  if (n == null || isNaN(n)) return "—";
  if (window.__privacyMode) return "$••••••";

  const code = options.code || getActiveCurrencyCode();
  const currency = getCurrency(code);
  const neg = n < 0;
  const abs = Math.abs(n);
  const decimals = currency.decimals ?? 2;

  const formatted = abs.toLocaleString(currency.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const prefix = currency.symbol;
  return neg ? `-${prefix}${formatted}` : `${prefix}${formatted}`;
}
