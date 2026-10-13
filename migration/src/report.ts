import type { DryRunReport } from "./types.ts";

function nok(minor: number): string {
  return new Intl.NumberFormat("en-NO", { style: "currency", currency: "NOK" }).format(minor / 100);
}

export function renderHumanReport(report: DryRunReport): string {
  const must = report.decisions.filter((item) => item.urgency === "must_resolve_before_import");
  const later = report.decisions.filter((item) => item.urgency === "can_resolve_after_cutover");
  const lines = [
    "# Runway 2 Phase 3 dry-run reconciliation",
    "",
    `- Run ID: \`${report.runId}\``,
    `- Source checksum: \`${report.source.checksum}\``,
    `- Source updated: ${report.source.updatedAt}`,
    `- Migration date: ${report.source.migrationDate}`,
    `- Status: ${report.financialVerification.noDoubleCountingPassed ? "financial reconciliation passed" : "financial reconciliation failed"}`,
    "",
    "## Opening balance",
    "",
    `- Legacy current balance: ${nok(report.financialVerification.legacyCurrentBalanceMinor)}`,
    `- Proposed Operating Cash opening balance: ${nok(report.financialVerification.proposedOpeningBalanceMinor)}`,
    `- Difference: ${nok(report.financialVerification.differenceMinor)}`,
    `- Operating floor: ${nok(report.financialVerification.warningThresholdProposedMinor)}`,
    "- Historical reference effect on ledger: NOK 0.00",
    "- Forecast effect on actual ledger: NOK 0.00",
    "",
    "## Legacy inventory",
    "",
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Preservation",
    "",
    `- Classified source items: ${report.preservation.sourceItemsClassified}`,
    `- Intentionally ignored after backup: ${report.preservation.intentionallyIgnored}`,
    `- Ambiguous: ${report.preservation.ambiguousItems}`,
    `- Failed: ${report.preservation.failedItems}`,
    `- Unmapped: ${report.preservation.unmappedItems}`,
    "",
    "## Must resolve before import",
    "",
    ...(must.length ? must.map((item) => `- ${item.question} (\`${item.sourcePath}\`)`) : ["- None."]),
    "",
    "## Can resolve after cutover",
    "",
    ...(later.length ? later.map((item) => `- ${item.question} (\`${item.sourcePath}\`)`) : ["- None."]),
    "",
    "## Safety",
    "",
    "This was a dry run. It did not call ledger posting RPCs, create authoritative normalized records, modify `public.runway_state`, or cut over production.",
    "",
  ];
  return lines.join("\n");
}

export function renderOwnerReview(report: DryRunReport): string {
  const groups = [
    ["Must resolve before import", "must_resolve_before_import"],
    ["Can resolve after cutover", "can_resolve_after_cutover"],
  ] as const;
  const lines = ["# Runway 2 migration decisions", ""];
  for (const [heading, urgency] of groups) {
    lines.push(`## ${heading}`, "");
    const decisions = report.decisions.filter((item) => item.urgency === urgency);
    lines.push(...(decisions.length ? decisions.map((item) => `- ${item.question} (\`${item.sourcePath}\`)`) : ["- None."]));
    lines.push("");
  }
  return lines.join("\n");
}
