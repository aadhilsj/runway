import type { CurrencyCode, MinorUnits } from "./types";

const DECIMAL_INPUT = /^-?(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/;

export function parseDisplayAmountToMinor(input: string): MinorUnits {
  const normalized = input.trim().replaceAll(" ", "").replace(",", ".");
  if (!DECIMAL_INPUT.test(normalized)) throw new Error("Enter a valid amount with at most two decimals");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole = "0", decimal = ""] = unsigned.split(".");
  const value = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) throw new Error("Amount is outside the safe range");
  return (negative ? -value : value) as MinorUnits;
}

export function formatMinorUnits(
  amountMinor: MinorUnits,
  currency: CurrencyCode,
  locale = "nb-NO",
): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Minor-unit amount must be a safe integer");
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

export function asMinorUnits(value: number): MinorUnits {
  if (!Number.isSafeInteger(value)) throw new Error("Minor-unit amount must be a safe integer");
  return value as MinorUnits;
}
