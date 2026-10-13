#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { executeDryRun } from "./dry-run.ts";
import { deterministicUuid } from "./deterministic.ts";
import { renderHumanReport, renderOwnerReview } from "./report.ts";
import type { LegacySourceRow } from "./types.ts";

interface BackupExport {
  rows?: LegacySourceRow[];
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourcePath = arg("--source");
const userId = arg("--user-id");
const migrationDate = arg("--migration-date");
const outputDirectory = arg("--output-dir");
const excludedUserIds = process.argv.flatMap((value, index, args) =>
  value === "--exclude-user-id" && args[index + 1] ? [args[index + 1] as string] : [],
);

if (!sourcePath || !userId || !migrationDate || !outputDirectory) {
  throw new Error("Usage: cli.ts --source <backup.json> --user-id <auth-verified UUID> --exclude-user-id <UUID> --migration-date YYYY-MM-DD --output-dir <private directory>");
}

const source = JSON.parse(await readFile(resolve(sourcePath), "utf8")) as BackupExport;
const rows = source.rows ?? [];
const matchingRows = rows.filter((row) => row.user_id === userId);
if (matchingRows.length !== 1) {
  throw new Error(`Expected exactly one immutable source row for the verified owner; found ${matchingRows.length}`);
}
for (const excludedUserId of excludedUserIds) {
  if (!rows.some((row) => row.user_id === excludedUserId)) {
    throw new Error(`Excluded legacy row ${excludedUserId} is not present in the immutable backup`);
  }
}

const row = matchingRows[0] as LegacySourceRow;
const report = executeDryRun({
  row,
  knownOwnerUserId: userId,
  excludedLegacyUserIds: excludedUserIds,
  migrationDate,
  ...(row.export_state_sha256 || row.state_sha256
    ? { expectedChecksum: row.export_state_sha256 ?? row.state_sha256 }
    : {}),
});

const directory = resolve(outputDirectory);
await mkdir(directory, { recursive: true, mode: 0o700 });
const { items, ...summary } = report;
const stagingPayload = {
  backup: {
    id: deterministicUuid(`${report.source.userId}:${report.source.checksum}:legacy-backup`),
    user_id: report.source.userId,
    source_updated_at: report.source.updatedAt,
    source_checksum: report.source.checksum,
  },
  run: {
    id: report.runId,
    user_id: report.source.userId,
    source_checksum: report.source.checksum,
    source_updated_at: report.source.updatedAt,
    target_schema_version: report.targetSchemaVersion,
    status: report.preservation.failedItems > 0 || report.preservation.ambiguousItems > 0 ? "needs_review" : "verified",
    importer_version: report.importerVersion,
    summary,
    verification_status: report.financialVerification.noDoubleCountingPassed
      ? report.preservation.ambiguousItems > 0 ? "needs_review" : "passed"
      : "failed",
  },
  items: items.map((item) => ({
    id: item.id,
    migration_run_id: item.migrationRunId,
    user_id: item.userId,
    source_type: item.sourceType,
    source_id: item.sourceId,
    source_path: item.sourcePath,
    source_json: null,
    proposed_target_type: item.proposedTargetType,
    proposed_target_id: item.proposedTargetId,
    classification: item.classification,
    data_quality: item.dataQuality,
    ambiguity_code: item.ambiguityCode,
    ambiguity_notes: item.ambiguityNotes,
    resolution_status: item.resolutionStatus,
    proposed_mapping_json: item.proposedMapping,
    resulting_entity_id: null,
  })),
};

await Promise.all([
  writeFile(resolve(directory, "dry-run-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
  writeFile(resolve(directory, "dry-run-summary.md"), renderHumanReport(report), { mode: 0o600 }),
  writeFile(resolve(directory, "product-owner-review.md"), renderOwnerReview(report), { mode: 0o600 }),
  writeFile(resolve(directory, "staging-payload.json"), `${JSON.stringify(stagingPayload, null, 2)}\n`, { mode: 0o600 }),
]);

process.stdout.write(`${JSON.stringify({
  runId: report.runId,
  sourceChecksum: report.source.checksum,
  outputDirectory: directory,
  counts: report.counts,
  preservation: report.preservation,
  financialVerification: report.financialVerification,
}, null, 2)}\n`);
