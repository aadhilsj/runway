import { isRecord, optionalString, validIsoDate } from "./legacy-schema.ts";
import { legacyAmountToMinor } from "./money.ts";
import { normalizeLegacyId, normalizeText } from "./normalization.ts";

export interface TemplateAnalysis {
  sourceId: string | null;
  label: string;
  type: "single" | "recurring" | "unknown";
  classification: "useful_quick_entry_preset" | "candidate_recurring_rule" | "needs_review";
  startMonth: string | null;
  endMonth: string | null;
  itemCount: number;
  requiresContinuationConfirmation: boolean;
  issues: string[];
}

const validMonth = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function analyzeTemplate(value: unknown, migrationDate: string): TemplateAnalysis {
  if (!isRecord(value)) {
    return {
      sourceId: null,
      label: "Malformed legacy template",
      type: "unknown",
      classification: "needs_review",
      startMonth: null,
      endMonth: null,
      itemCount: 0,
      requiresContinuationConfirmation: true,
      issues: ["template is not an object"],
    };
  }

  const issues: string[] = [];
  const sourceId = normalizeLegacyId(value.id);
  const label = normalizeText(value.label) || "Untitled legacy template";
  if (!sourceId) issues.push("missing template ID");
  if (!optionalString(value.label)) issues.push("missing template label");

  if (value.type === "single") {
    const amount = legacyAmountToMinor(value.amount);
    if (!amount.ok) issues.push(amount.reason ?? "invalid template amount");
    if (!validIsoDate(value.date)) issues.push("invalid single-template date");
    return {
      sourceId,
      label,
      type: "single",
      classification: issues.length === 0 ? "useful_quick_entry_preset" : "needs_review",
      startMonth: null,
      endMonth: null,
      itemCount: 1,
      requiresContinuationConfirmation: false,
      issues,
    };
  }

  if (value.type === "recurring") {
    const startMonth = validMonth(value.startMonth) ? value.startMonth : null;
    const endMonth = validMonth(value.endMonth) ? value.endMonth : null;
    const items = Array.isArray(value.items) ? value.items : [];
    if (!startMonth) issues.push("invalid recurring start month");
    if (!endMonth) issues.push("invalid recurring end month");
    if (startMonth && endMonth && startMonth > endMonth) issues.push("recurring period ends before it starts");
    if (!Array.isArray(value.items)) issues.push("recurring items must be an array");
    if (items.length === 0) issues.push("recurring template has no items");
    const migrationMonth = migrationDate.slice(0, 7);
    return {
      sourceId,
      label,
      type: "recurring",
      classification: issues.length === 0 ? "candidate_recurring_rule" : "needs_review",
      startMonth,
      endMonth,
      itemCount: items.length,
      requiresContinuationConfirmation: !endMonth || endMonth < migrationMonth,
      issues,
    };
  }

  issues.push("unknown template type");
  return {
    sourceId,
    label,
    type: "unknown",
    classification: "needs_review",
    startMonth: null,
    endMonth: null,
    itemCount: 0,
    requiresContinuationConfirmation: true,
    issues,
  };
}
