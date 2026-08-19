import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { executeDryRun } from "../../../migration/src/dry-run.ts";
import type { DryRunReport, LegacySourceRow } from "../../../migration/src/types.ts";

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
let fixtureRow: LegacySourceRow;

beforeAll(async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "../migration/fixtures/legacy/sanitized-structure.json"), "utf8"));
  fixtureRow = fixture.row as LegacySourceRow;
});

function reportWith(mutator?: (state: Record<string, any>) => void): DryRunReport {
  const row = structuredClone(fixtureRow);
  mutator?.(row.state as Record<string, any>);
  return executeDryRun({
    row,
    knownOwnerUserId: USER_A,
    excludedLegacyUserIds: [USER_B],
    migrationDate: "2030-01-15",
  });
}

describe("Phase 3 deterministic legacy importer", () => {
  it("maps the exact current balance and warning floor without double counting", () => {
    const report = reportWith();
    expect(report.financialVerification).toMatchObject({
      legacyCurrentBalanceMinor: 123456,
      proposedOpeningBalanceMinor: 123456,
      differenceMinor: 0,
      warningThresholdLegacyMinor: 25000,
      warningThresholdProposedMinor: 25000,
      historicalReferenceLedgerEffectMinor: 0,
      forecastLedgerEffectMinor: 0,
      noDoubleCountingPassed: true,
    });
  });

  it("handles an otherwise empty legacy state", () => {
    const report = reportWith((state) => {
      state.events = [];
      state.scenarios = [];
      state.templates = [];
      state.bucketTemplates = [];
      state.buckets = {};
    });
    expect(report.counts).toMatchObject({ eventsTotal: 0, scenarios: 0, templates: 0, bucketEntries: 0 });
    expect(report.preservation.failedItems).toBe(0);
  });

  it("keeps settled actual amounts and planned-only amounts in non-authoritative history", () => {
    const report = reportWith((state) => {
      state.events.push({
        id: "planned-only", label: "Invented settled", amount: -10, actualAmount: null,
        date: "2030-01-02", category: "Bills", notes: "", scenarioId: null, isSettled: true,
      });
    });
    const settled = report.items.filter((item) => item.sourcePath.startsWith("events[") && item.classification.startsWith("settled_historical"));
    expect(settled.map((item) => item.classification)).toContain("settled_historical_exact_actual");
    expect(settled.map((item) => item.classification)).toContain("settled_historical_planned_amount_only");
    expect(settled.every((item) => item.proposedMapping.authoritativeLedgerEffectMinor === 0)).toBe(true);
  });

  it("types positive income and negative expense while preserving the signed source amount", () => {
    const report = reportWith();
    const income = report.items.find((item) => item.sourceId === "sample-income")!;
    const expense = report.items.find((item) => item.sourceId === "sample-expense")!;
    expect(income.proposedMapping).toMatchObject({ semanticType: "income", originalSignedAmount: 500 });
    expect(expense.proposedMapping).toMatchObject({ semanticType: "expense", originalSignedAmount: -75.25 });
  });

  it("preserves quick-entry events at normal quality", () => {
    const report = reportWith();
    const quickEntry = report.items.find((item) => item.sourceId === "sample-expense")!;
    expect(quickEntry.dataQuality).toBe("exact");
    expect(quickEntry.proposedMapping.notes).toContain("Quick entry");
  });

  it("maps scenario events and retains included/excluded comparison preferences", () => {
    const report = reportWith((state) => {
      state.events.push(
        { id: "scenario-excluded", label: "Excluded", amount: -20, actualAmount: null, date: "2030-02-02", category: "Travel", notes: "", scenarioId: "sample-plan", isSettled: false },
      );
      state.scenarios.push({ id: "included-plan", name: "Included", description: "", isIncluded: true });
      state.events.push(
        { id: "scenario-included", label: "Included", amount: -30, actualAmount: null, date: "2030-02-03", category: "Travel", notes: "", scenarioId: "included-plan", isSettled: false },
      );
    });
    expect(report.counts.scenarioEvents).toBe(2);
    expect(report.financialVerification.excludedScenarioForecastTotalMinor).toBe(-2000);
    expect(report.financialVerification.futureIncludedForecastTotalMinor).toBe(47000);
    const scenario = report.items.find((item) => item.sourceId === "sample-plan")!;
    expect(scenario.proposedMapping.changesCanonicalBasePlan).toBe(false);
  });

  it("isolates overdue unsettled events for owner resolution", () => {
    const report = reportWith((state) => state.events.push({
      id: "overdue", label: "Invented overdue", amount: -12, actualAmount: null,
      date: "2030-01-01", category: "Misc", notes: "", scenarioId: null, isSettled: false,
    }));
    expect(report.counts.overdueUnsettled).toBe(1);
    expect(report.overdueItems[0]?.sourceId).toBe("overdue");
    expect(report.decisions.some((decision) => decision.code === "overdue_unsettled_event" && decision.urgency === "must_resolve_before_import")).toBe(true);
  });

  it("preserves an unknown custom category as a proposed user category", () => {
    const report = reportWith((state) => state.events.push({
      id: "custom", label: "Invented custom", amount: -12, actualAmount: null,
      date: "2030-02-04", category: "Pets", notes: "", scenarioId: null, isSettled: false,
    }));
    expect(report.categoryMappings).toContainEqual(expect.objectContaining({ legacyName: "Pets", proposedSlug: "legacy-pets", isKnown: false }));
  });

  it("analyzes finite recurring templates without extending them indefinitely", () => {
    const report = reportWith();
    const recurring = report.items.find((item) => item.sourceId === "sample-recurring-template")!;
    expect(recurring.classification).toBe("candidate_recurring_rule");
    expect(recurring.proposedMapping).toMatchObject({ oldStartMonth: "2030-02", oldEndMonth: "2030-04", continueIndefinitely: false });
    expect(report.items.some((item) => item.sourceType === "recurring_template_item")).toBe(true);
  });

  it("reports possible materialized recurring events and never auto-deduplicates", () => {
    const report = reportWith((state) => state.events.push({
      id: "materialized", label: "Invented generated", amount: -300, actualAmount: null,
      date: "2030-02-05", category: "Housing", notes: "Created from Invented finite bundle", scenarioId: null, isSettled: false,
    }));
    const hint = report.items.find((item) => item.classification === "possible_materialized_recurring_event")!;
    expect(hint.proposedMapping.autoDeduplicated).toBe(false);
    expect(report.counts.eventsTotal).toBe(3);
  });

  it("flags probable bucket duplicates and unmatched bucket spend without posting either", () => {
    const report = reportWith((state) => state.buckets["2030-01"].Groceries.entries.push({
      id: "unmatched", amount: 33, date: "2030-01-12", note: "Invented unmatched",
    }));
    const bucketItems = report.items.filter((item) => item.sourceType === "bucket_spend");
    expect(bucketItems.map((item) => item.classification)).toContain("probable_duplicate");
    expect(bucketItems.map((item) => item.classification)).toContain("unmatched_bucket_spend");
    expect(bucketItems.every((item) => item.proposedMapping.createPostedTransaction === false)).toBe(true);
  });

  it("preserves malformed dates and amounts as failed review items", () => {
    const report = reportWith((state) => state.events.push({
      id: "malformed", label: "Invented malformed", amount: "1.234", actualAmount: null,
      date: "2030-99-99", category: "Misc", notes: "", scenarioId: null, isSettled: false,
    }));
    const item = report.items.find((candidate) => candidate.sourceId === "malformed")!;
    expect(item).toMatchObject({ classification: "event_needs_review", dataQuality: "invalid", resolutionStatus: "unresolved" });
    expect(report.preservation.failedItems).toBeGreaterThan(0);
  });

  it("refuses a source row for a different user", () => {
    const row = structuredClone(fixtureRow);
    expect(() => executeDryRun({
      row,
      knownOwnerUserId: USER_B,
      excludedLegacyUserIds: [USER_A],
      migrationDate: "2030-01-15",
    })).toThrow(/Auth-verified owner/);
  });

  it("produces the same run and item IDs on deterministic rerun", () => {
    const first = reportWith();
    const second = reportWith();
    expect(second.runId).toBe(first.runId);
    expect(second.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
    expect(second.source.checksum).toBe(first.source.checksum);
  });
});
