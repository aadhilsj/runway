import { isRecord, optionalString } from "./legacy-schema.ts";
import { normalizeLegacyId, normalizeText } from "./normalization.ts";

export interface ScenarioAnalysis {
  sourceId: string | null;
  name: string;
  description: string | null;
  includedPreference: boolean | null;
  issues: string[];
}

export function analyzeScenario(value: unknown): ScenarioAnalysis {
  if (!isRecord(value)) {
    return { sourceId: null, name: "Malformed legacy plan", description: null, includedPreference: null, issues: ["scenario is not an object"] };
  }

  const issues: string[] = [];
  const sourceId = normalizeLegacyId(value.id);
  const name = normalizeText(value.name) || "Untitled legacy plan";
  const includedPreference = typeof value.isIncluded === "boolean" ? value.isIncluded : null;
  if (!sourceId) issues.push("missing scenario ID");
  if (!optionalString(value.name)) issues.push("missing scenario name");
  if (includedPreference === null) issues.push("invalid included preference");

  return {
    sourceId,
    name,
    description: optionalString(value.description),
    includedPreference,
    issues,
  };
}
