import type { LegacyStateView, ValidationIssue } from "./types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordSection(
  root: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): Record<string, unknown> {
  const value = root[key];
  if (isRecord(value)) return value;
  issues.push({ path: key, code: "invalid_section", message: `${key} must be an object` });
  return {};
}

function arraySection(
  root: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): unknown[] {
  const value = root[key];
  if (Array.isArray(value)) return value;
  issues.push({ path: key, code: "invalid_section", message: `${key} must be an array` });
  return [];
}

export function validateLegacyState(input: unknown): {
  state: LegacyStateView;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const root = isRecord(input) ? input : {};

  if (!isRecord(input)) {
    issues.push({ path: "$", code: "invalid_root", message: "legacy state must be an object" });
  }

  const state: LegacyStateView = {
    raw: root,
    account: recordSection(root, "account", issues),
    events: arraySection(root, "events", issues),
    scenarios: arraySection(root, "scenarios", issues),
    templates: arraySection(root, "templates", issues),
    bucketTemplates: arraySection(root, "bucketTemplates", issues),
    buckets: recordSection(root, "buckets", issues),
    ui: recordSection(root, "ui", issues),
    meta: recordSection(root, "meta", issues),
  };

  return { state, issues };
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
