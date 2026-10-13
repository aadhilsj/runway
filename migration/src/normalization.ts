import { optionalString } from "./legacy-schema.ts";

export function normalizeText(value: unknown): string {
  return optionalString(value)?.replace(/\s+/g, " ").trim() ?? "";
}

export function normalizeLegacyId(value: unknown): string | null {
  return optionalString(value);
}

export function normalizedComparableText(value: unknown): string {
  return normalizeText(value).toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}
