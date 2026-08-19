import { isRecord, optionalString, validIsoDate } from "./legacy-schema.ts";
import { legacyAmountToMinor } from "./money.ts";
import { normalizeLegacyId, normalizeText } from "./normalization.ts";

export interface EventAnalysis {
  sourceId: string | null;
  label: string;
  date: string | null;
  category: string | null;
  scenarioId: string | null;
  notes: string | null;
  isSettled: boolean | null;
  plannedMinor: number;
  plannedAmountValid: boolean;
  actualMinor: number | null;
  actualAmountPresent: boolean;
  actualAmountValid: boolean;
  issues: string[];
}

export function analyzeLegacyEvent(value: unknown): EventAnalysis {
  if (!isRecord(value)) {
    return {
      sourceId: null,
      label: "Malformed legacy event",
      date: null,
      category: null,
      scenarioId: null,
      notes: null,
      isSettled: null,
      plannedMinor: 0,
      plannedAmountValid: false,
      actualMinor: null,
      actualAmountPresent: false,
      actualAmountValid: false,
      issues: ["event is not an object"],
    };
  }

  const issues: string[] = [];
  const planned = legacyAmountToMinor(value.amount);
  const actualPresent = value.actualAmount !== null && value.actualAmount !== undefined && value.actualAmount !== "";
  const actual = actualPresent ? legacyAmountToMinor(value.actualAmount) : null;
  const date = validIsoDate(value.date) ? value.date : null;
  const isSettled = typeof value.isSettled === "boolean" ? value.isSettled : null;

  if (!planned.ok) issues.push(planned.reason ?? "invalid planned amount");
  if (actualPresent && !actual?.ok) issues.push(actual?.reason ?? "invalid actual amount");
  if (!date) issues.push("invalid or missing event date");
  if (isSettled === null) issues.push("invalid or missing settlement status");
  if (!optionalString(value.label)) issues.push("missing event label");

  return {
    sourceId: normalizeLegacyId(value.id),
    label: normalizeText(value.label) || "Untitled legacy event",
    date,
    category: optionalString(value.category),
    scenarioId: normalizeLegacyId(value.scenarioId),
    notes: optionalString(value.notes),
    isSettled,
    plannedMinor: planned.minor,
    plannedAmountValid: planned.ok,
    actualMinor: actual?.ok ? actual.minor : null,
    actualAmountPresent: actualPresent,
    actualAmountValid: !actualPresent || Boolean(actual?.ok),
    issues,
  };
}
