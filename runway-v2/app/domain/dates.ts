import type { DateOnly } from "./types";

export function asDateOnly(value: string): DateOnly {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected a date-only YYYY-MM-DD value");
  return value as DateOnly;
}

export function compareDateOnly(left: DateOnly, right: DateOnly): number {
  return left.localeCompare(right);
}
