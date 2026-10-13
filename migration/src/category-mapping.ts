import type { CategoryMapping } from "./types.ts";

const KNOWN_CATEGORIES: Record<string, Omit<CategoryMapping, "legacyName" | "isKnown">> = {
  Income: { proposedName: "Income", proposedSlug: "income", proposedKind: "income" },
  Housing: { proposedName: "Housing", proposedSlug: "housing", proposedKind: "expense" },
  Groceries: { proposedName: "Groceries", proposedSlug: "groceries", proposedKind: "expense" },
  Bills: { proposedName: "Bills", proposedSlug: "bills", proposedKind: "expense" },
  Transport: { proposedName: "Transport", proposedSlug: "transport", proposedKind: "expense" },
  Travel: { proposedName: "Travel", proposedSlug: "travel", proposedKind: "expense" },
  Shopping: { proposedName: "Shopping", proposedSlug: "shopping", proposedKind: "expense" },
  Misc: { proposedName: "Miscellaneous", proposedSlug: "miscellaneous", proposedKind: "expense" },
};

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "legacy-custom";
}

export function mapLegacyCategory(name: unknown, signedMinor = -1): CategoryMapping | null {
  if (typeof name !== "string" || name.trim() === "") return null;
  const legacyName = name.trim();
  const known = KNOWN_CATEGORIES[legacyName];
  if (known) return { legacyName, ...known, isKnown: true };

  return {
    legacyName,
    proposedName: legacyName,
    proposedSlug: `legacy-${slugify(legacyName)}`,
    proposedKind: signedMinor > 0 ? "income" : "expense",
    isKnown: false,
  };
}
