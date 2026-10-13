import { canonicalJson, checksumText } from "./deterministic.ts";

export type IntegrityDomain =
  | "account/current balance" | "warning threshold" | "events" | "settled/unsettled status"
  | "event amounts" | "event dates" | "scenarios" | "scenario inclusion" | "templates"
  | "recurring templates" | "buckets" | "bucket spending" | "UI state" | "activity history"
  | "sync metadata" | "other";

export interface SemanticChange {
  domain: IntegrityDomain;
  path: string;
  stableId: string | null;
  oldValue: unknown;
  newValue: unknown;
  financialSignificance: "non_financial" | "financial_migration_neutral" | "financial_migration_affecting" | "unknown";
  blocksCutover: boolean;
}

function domainFor(path: string): IntegrityDomain {
  if (path === "account.currentBalance") return "account/current balance";
  if (path === "account.warningThreshold") return "warning threshold";
  if (/^events\[id=.*\]\.isSettled$/.test(path)) return "settled/unsettled status";
  if (/^events\[id=.*\]\.(amount|actualAmount)$/.test(path)) return "event amounts";
  if (/^events\[id=.*\]\.date$/.test(path)) return "event dates";
  if (path.startsWith("events")) return "events";
  if (/^scenarios\[id=.*\]\.isIncluded$/.test(path)) return "scenario inclusion";
  if (path.startsWith("scenarios")) return "scenarios";
  if (path.startsWith("templates") && path.includes("type")) return "recurring templates";
  if (path.startsWith("templates")) return "templates";
  if (path.startsWith("buckets") && path.includes("entries")) return "bucket spending";
  if (path.startsWith("buckets") || path.startsWith("bucketTemplates")) return "buckets";
  if (path.startsWith("ui.history")) return "activity history";
  if (path.startsWith("ui")) return "UI state";
  if (path.startsWith("meta")) return "sync metadata";
  return "other";
}

function significance(domain: IntegrityDomain): Pick<SemanticChange, "financialSignificance" | "blocksCutover"> {
  if (["UI state", "activity history", "sync metadata"].includes(domain)) {
    return { financialSignificance: "non_financial", blocksCutover: false };
  }
  if (["buckets", "bucket spending"].includes(domain)) {
    return { financialSignificance: "financial_migration_neutral", blocksCutover: false };
  }
  if (domain === "other") return { financialSignificance: "unknown", blocksCutover: true };
  return { financialSignificance: "financial_migration_affecting", blocksCutover: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableArray(value: unknown[]): boolean {
  return value.every((item) => isRecord(item) && typeof item.id === "string");
}

export function semanticLegacyDiff(approved: unknown, cutover: unknown): SemanticChange[] {
  const changes: SemanticChange[] = [];
  const visit = (oldValue: unknown, newValue: unknown, path: string, stableId: string | null) => {
    if (canonicalJson(oldValue) === canonicalJson(newValue)) return;
    if (Array.isArray(oldValue) && Array.isArray(newValue) && stableArray(oldValue) && stableArray(newValue)) {
      const oldMap = new Map(oldValue.map((item) => [String((item as Record<string, unknown>).id), item]));
      const newMap = new Map(newValue.map((item) => [String((item as Record<string, unknown>).id), item]));
      for (const id of [...new Set([...oldMap.keys(), ...newMap.keys()])].sort()) {
        visit(oldMap.get(id), newMap.get(id), `${path}[id=${id}]`, id);
      }
      return;
    }
    if (isRecord(oldValue) && isRecord(newValue)) {
      for (const key of [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].sort()) {
        visit(oldValue[key], newValue[key], path ? `${path}.${key}` : key, stableId);
      }
      return;
    }
    const domain = domainFor(path);
    changes.push({ domain, path, stableId, oldValue, newValue, ...significance(domain) });
  };
  visit(approved, cutover, "", null);
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

export function financialClassification(changes: SemanticChange[]): "A" | "B" | "C" | "D" {
  if (changes.some((change) => change.financialSignificance === "unknown")) return "D";
  if (changes.some((change) => change.financialSignificance === "financial_migration_affecting")) return "C";
  if (changes.some((change) => change.financialSignificance === "financial_migration_neutral")) return "B";
  return "A";
}

export function deterministicPlanningPatch(approved: unknown, cutover: unknown): SemanticChange[] {
  return semanticLegacyDiff(approved, cutover).filter((change) =>
    ["events", "settled/unsettled status", "event amounts", "event dates", "scenarios", "scenario inclusion", "templates", "recurring templates"].includes(change.domain),
  );
}

export function verifyExportChecksum(stateCanonicalText: string, declaredChecksum: string, parsedState: unknown): void {
  if (checksumText(stateCanonicalText) !== declaredChecksum) {
    throw new Error("Export-text checksum does not match the approved migration source");
  }
  if (canonicalJson(JSON.parse(stateCanonicalText)) !== canonicalJson(parsedState)) {
    throw new Error("Export-text payload is not semantically equal to the parsed migration state");
  }
}
