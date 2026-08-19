export interface MinorUnitResult {
  ok: boolean;
  minor: number;
  reason?: string;
}

export function legacyAmountToMinor(value: unknown): MinorUnitResult {
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, minor: 0, reason: "amount is not a number or numeric string" };
  }

  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) {
    return { ok: false, minor: 0, reason: "amount has more than two decimals or invalid syntax" };
  }

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const minorBigInt = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -minorBigInt : minorBigInt;

  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    return { ok: false, minor: 0, reason: "amount exceeds safe integer range" };
  }

  return { ok: true, minor: Number(signed) };
}
