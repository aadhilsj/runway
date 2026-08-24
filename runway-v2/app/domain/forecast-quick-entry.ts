import { parseDisplayAmountToMinor } from "./money";

export type ForecastQuickEntry = {
  kind: "income" | "expense";
  label: string;
  amountMinor: number;
  expectedDate: string;
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_PATTERN = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDate(year: number, month: number, day: number): Date | null {
  const value = new Date(year, month - 1, day, 12);
  return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day ? value : null;
}

function monthNumber(value: string): number {
  const normalized = value.toLowerCase();
  return MONTHS.findIndex((month) => month.startsWith(normalized)) + 1;
}

function inferredDate(raw: string, now: Date): { date: string; matchedText: string } {
  const relative = raw.match(/\b(today|tomorrow)\b/i);
  if (relative) {
    const value = new Date(now);
    if (relative[1]!.toLowerCase() === "tomorrow") value.setDate(value.getDate() + 1);
    return { date: localDate(value), matchedText: relative[0] };
  }

  const named = raw.match(new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(?:on|in))?\\s+(${MONTH_PATTERN})|(${MONTH_PATTERN})(?:\\s+(?:on|in))?\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:\\s+(\\d{4}))?\\b`, "i"));
  if (named) {
    const day = Number(named[1] ?? named[4]);
    const month = monthNumber(named[2] ?? named[3] ?? "");
    let year = Number(named[5] ?? now.getFullYear());
    let value = month ? validDate(year, month, day) : null;
    if (value && !named[5] && localDate(value) < localDate(now)) value = validDate(++year, month, day);
    if (value) return { date: localDate(value), matchedText: named[0] };
  }

  const numeric = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    let value = validDate(year, month, day);
    if (value && !numeric[3] && localDate(value) < localDate(now)) value = validDate(++year, month, day);
    if (value) return { date: localDate(value), matchedText: numeric[0] };
  }

  return { date: localDate(now), matchedText: "" };
}

export function parseForecastQuickEntry(raw: string, now = new Date()): ForecastQuickEntry {
  const input = raw.trim();
  if (!input) throw new Error("Describe the planned item.");
  const date = inferredDate(input, now);
  const withoutDate = date.matchedText ? input.replace(date.matchedText, " ") : input;
  const amountMatch = withoutDate.match(/[+-]?\s*\d+(?:[.,]\d{1,2})?/);
  if (!amountMatch) throw new Error("Include an amount, for example: Phone bill 568 on 15 Sep.");
  const amountText = amountMatch[0].replaceAll(" ", "");
  const amountMinor = Math.abs(Number(parseDisplayAmountToMinor(amountText.replace(/^\+/, ""))));
  if (amountMinor <= 0) throw new Error("Amount must be positive.");
  const label = withoutDate
    .replace(amountMatch[0], " ")
    .replace(/\b(on|at|for)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) throw new Error("Include a short label, for example: Phone bill 568 on 15 Sep.");
  return { kind: amountText.startsWith("+") ? "income" : "expense", label, amountMinor, expectedDate: date.date };
}
