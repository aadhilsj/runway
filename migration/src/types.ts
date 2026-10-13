export const IMPORTER_VERSION = "runway-legacy-importer-v1";
export const TARGET_SCHEMA_VERSION = "normalized-v1";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type DataQuality =
  | "exact"
  | "inferred"
  | "ambiguous"
  | "invalid"
  | "not_applicable";

export type ResolutionStatus =
  | "not_required"
  | "unresolved"
  | "resolved"
  | "intentionally_ignored";

export interface LegacySourceRow {
  user_id: string;
  updated_at: string;
  state: unknown;
  state_sha256?: string;
  export_state_sha256?: string;
  state_canonical_text?: string;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface LegacyStateView {
  raw: Record<string, unknown>;
  account: Record<string, unknown>;
  events: unknown[];
  scenarios: unknown[];
  templates: unknown[];
  bucketTemplates: unknown[];
  buckets: Record<string, unknown>;
  ui: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export interface ProposedImportItem {
  id: string;
  migrationRunId: string;
  userId: string;
  sourceType: string;
  sourceId: string | null;
  sourcePath: string;
  proposedTargetType: string;
  proposedTargetId: string | null;
  classification: string;
  dataQuality: DataQuality;
  ambiguityCode: string | null;
  ambiguityNotes: string | null;
  resolutionStatus: ResolutionStatus;
  proposedMapping: Record<string, JsonValue>;
  resultingEntityId: null;
}

export interface CategoryMapping {
  legacyName: string;
  proposedName: string;
  proposedSlug: string;
  proposedKind: "income" | "expense";
  isKnown: boolean;
}

export interface OwnerDecision {
  urgency: "must_resolve_before_import" | "can_resolve_after_cutover";
  code: string;
  sourcePath: string;
  question: string;
}

export interface DryRunCounts {
  eventsTotal: number;
  settled: number;
  unsettled: number;
  overdueUnsettled: number;
  scenarioEvents: number;
  scenarios: number;
  templates: number;
  recurringTemplates: number;
  bucketMonths: number;
  bucketEntries: number;
}

export interface DryRunReport {
  reportVersion: "phase-3-v1";
  mode: "dry_run";
  importerVersion: string;
  targetSchemaVersion: string;
  runId: string;
  source: {
    userId: string;
    emailEvidence: "known_email_auth_match";
    updatedAt: string;
    checksum: string;
    migrationDate: string;
    excludedLegacyUserIds: string[];
  };
  counts: DryRunCounts;
  proposedMappings: Record<string, number>;
  categoryMappings: CategoryMapping[];
  financialVerification: {
    currency: "NOK";
    legacyCurrentBalanceMinor: number;
    proposedOpeningBalanceMinor: number;
    differenceMinor: number;
    warningThresholdLegacyMinor: number;
    warningThresholdProposedMinor: number;
    historicalReferenceLedgerEffectMinor: 0;
    forecastLedgerEffectMinor: 0;
    openingBalanceLedgerEffectMinor: number;
    noDoubleCountingPassed: boolean;
    futureIncludedForecastTotalMinor: number;
    excludedScenarioForecastTotalMinor: number;
    scenarioTotalsMinor: Record<string, number>;
  };
  preservation: {
    sourceItemsClassified: number;
    intentionallyIgnored: number;
    failedItems: number;
    ambiguousItems: number;
    unmappedItems: number;
  };
  ambiguities: Array<{
    code: string;
    sourcePath: string;
    notes: string;
  }>;
  overdueItems: Array<{
    sourcePath: string;
    sourceId: string | null;
    label: string;
    date: string;
    amountMinor: number;
  }>;
  decisions: OwnerDecision[];
  items: ProposedImportItem[];
}

export interface DryRunInput {
  row: LegacySourceRow;
  knownOwnerUserId: string;
  excludedLegacyUserIds: string[];
  migrationDate: string;
  expectedChecksum?: string;
}
