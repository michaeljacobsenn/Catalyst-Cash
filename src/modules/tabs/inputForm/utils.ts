export type MoneyInput = number | string;

export const sanitizeDollar = (value: string): string => value.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "");

export const toNumber = (value: MoneyInput | "" | null | undefined): number => parseFloat(String(value ?? "0")) || 0;

export const toMoneyInput = (value: unknown): MoneyInput | "" =>
  typeof value === "number" || typeof value === "string" ? value : "";
