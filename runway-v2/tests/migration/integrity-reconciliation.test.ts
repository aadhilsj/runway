import { describe, expect, it } from "vitest";
import { canonicalJson, checksumText } from "../../../migration/src/deterministic.ts";
import {
  deterministicPlanningPatch, financialClassification, semanticLegacyDiff, verifyExportChecksum,
} from "../../../migration/src/integrity-reconciliation.ts";

const baseline = {
  account: { currentBalance: 100, warningThreshold: 20 },
  events: [{ id: "event-a", label: "Invented rent", amount: -25, date: "2030-02-01", isSettled: false }],
  scenarios: [{ id: "scenario-a", name: "Invented plan", isIncluded: false }],
  templates: [{ id: "template-a", type: "recurring", label: "Invented finite rule", endMonth: "2030-04" }],
  buckets: {}, ui: { search: "", history: [] }, meta: { lastSync: "before" },
};

describe("Phase 4.1 integrity reconciliation", () => {
  it("rejects an approved export checksum that does not match its exact representation", () => {
    const text = JSON.stringify(baseline, null, 2);
    expect(() => verifyExportChecksum(text, "0".repeat(64), baseline)).toThrow(/checksum/i);
    expect(() => verifyExportChecksum(text, checksumText(text), baseline)).not.toThrow();
  });

  it("blocks cutover when authoritative financial state changes", () => {
    const changed = structuredClone(baseline); changed.account.currentBalance = 101;
    const diff = semanticLegacyDiff(baseline, changed);
    expect(diff).toContainEqual(expect.objectContaining({ domain: "account/current balance", oldValue: 100, newValue: 101, blocksCutover: true }));
    expect(financialClassification(diff)).toBe("C");
  });

  it("classifies UI-only changes without weakening exact checksum verification", () => {
    const changed = structuredClone(baseline); changed.ui.search = "invented query";
    const diff = semanticLegacyDiff(baseline, changed);
    expect(diff).toContainEqual(expect.objectContaining({ domain: "UI state", blocksCutover: false }));
    expect(financialClassification(diff)).toBe("A");
    expect(canonicalJson(changed)).not.toBe(canonicalJson(baseline));
  });

  it("produces a deterministic stable-ID planning patch", () => {
    const changed = structuredClone(baseline); changed.events[0]!.amount = -30; changed.scenarios[0]!.isIncluded = true;
    const first = deterministicPlanningPatch(baseline, changed);
    const second = deterministicPlanningPatch(baseline, changed);
    expect(second).toEqual(first);
    expect(first.map((change) => [change.stableId, change.domain])).toEqual([
      ["event-a", "event amounts"], ["scenario-a", "scenario inclusion"],
    ]);
  });
});
