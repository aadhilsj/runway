import { analyzeBucketEntry, matchBucketEntry } from "./bucket-analysis.ts";
import { mapLegacyCategory } from "./category-mapping.ts";
import { checksumJson, checksumText, deterministicUuid } from "./deterministic.ts";
import { analyzeLegacyEvent, type EventAnalysis } from "./event-mapping.ts";
import { verifyExportChecksum } from "./integrity-reconciliation.ts";
import { isRecord, optionalString, validIsoDate, validateLegacyState } from "./legacy-schema.ts";
import { legacyAmountToMinor } from "./money.ts";
import { normalizeLegacyId, normalizeText, normalizedComparableText } from "./normalization.ts";
import { reconcileOpeningBalance } from "./reconciliation.ts";
import { analyzeScenario } from "./scenario-mapping.ts";
import { analyzeTemplate } from "./template-analysis.ts";
import {
  IMPORTER_VERSION,
  TARGET_SCHEMA_VERSION,
  type CategoryMapping,
  type DryRunInput,
  type DryRunReport,
  type JsonValue,
  type OwnerDecision,
  type ProposedImportItem,
} from "./types.ts";

interface ItemOptions {
  sourceType: string;
  sourceId?: string | null;
  sourcePath: string;
  proposedTargetType: string;
  proposedTargetId?: string | null;
  classification: string;
  dataQuality: ProposedImportItem["dataQuality"];
  ambiguityCode?: string | null;
  ambiguityNotes?: string | null;
  resolutionStatus?: ProposedImportItem["resolutionStatus"];
  proposedMapping?: Record<string, JsonValue>;
}

function validMigrationDate(value: string): void {
  if (!validIsoDate(value)) throw new Error(`Invalid migration date: ${value}`);
}

function makeItem(runId: string, userId: string, options: ItemOptions): ProposedImportItem {
  return {
    id: deterministicUuid(`${runId}:item:${options.sourcePath}`),
    migrationRunId: runId,
    userId,
    sourceType: options.sourceType,
    sourceId: options.sourceId ?? null,
    sourcePath: options.sourcePath,
    proposedTargetType: options.proposedTargetType,
    proposedTargetId: options.proposedTargetId ?? null,
    classification: options.classification,
    dataQuality: options.dataQuality,
    ambiguityCode: options.ambiguityCode ?? null,
    ambiguityNotes: options.ambiguityNotes ?? null,
    resolutionStatus: options.resolutionStatus ?? "not_required",
    proposedMapping: options.proposedMapping ?? {},
    resultingEntityId: null,
  };
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function addDecision(decisions: OwnerDecision[], decision: OwnerDecision): void {
  if (!decisions.some((item) => item.code === decision.code && item.sourcePath === decision.sourcePath)) {
    decisions.push(decision);
  }
}

export function executeDryRun(input: DryRunInput): DryRunReport {
  validMigrationDate(input.migrationDate);
  if (input.row.user_id !== input.knownOwnerUserId) {
    throw new Error("Source row user does not match the Auth-verified owner");
  }

  const calculatedChecksum = input.row.state_canonical_text
    ? checksumText(input.row.state_canonical_text)
    : checksumJson(input.row.state);
  const declaredExportChecksum = input.row.export_state_sha256;
  const sourceChecksum = declaredExportChecksum ?? input.row.state_sha256 ?? calculatedChecksum;
  if (declaredExportChecksum && input.row.state_canonical_text) {
    verifyExportChecksum(input.row.state_canonical_text, declaredExportChecksum, input.row.state);
  } else if (declaredExportChecksum && declaredExportChecksum !== calculatedChecksum) {
    throw new Error("Immutable source checksum does not match the source payload");
  }
  if (input.expectedChecksum && input.expectedChecksum !== sourceChecksum) {
    throw new Error("Immutable source checksum differs from the approved checksum");
  }

  const runId = deterministicUuid(
    `${input.row.user_id}:${sourceChecksum}:${IMPORTER_VERSION}:${TARGET_SCHEMA_VERSION}`,
  );
  const { state, issues: rootIssues } = validateLegacyState(input.row.state);
  const items: ProposedImportItem[] = [];
  const decisions: OwnerDecision[] = [];
  const categoryMap = new Map<string, CategoryMapping>();
  const eventAnalyses: EventAnalysis[] = [];
  const overdueItems: DryRunReport["overdueItems"] = [];

  const currentBalance = legacyAmountToMinor(state.account.currentBalance);
  const warningThreshold = legacyAmountToMinor(state.account.warningThreshold);
  items.push(
    makeItem(runId, input.row.user_id, {
      sourceType: "account",
      sourcePath: "account",
      proposedTargetType: "opening_balance_proposal",
      proposedTargetId: deterministicUuid(`${runId}:operating-cash`),
      classification: currentBalance.ok && warningThreshold.ok ? "authoritative_cutover_start" : "invalid_account_state",
      dataQuality: currentBalance.ok && warningThreshold.ok ? "exact" : "invalid",
      ambiguityCode: currentBalance.ok && warningThreshold.ok ? null : "invalid_account_amount",
      ambiguityNotes: [currentBalance.reason, warningThreshold.reason].filter(Boolean).join("; ") || null,
      resolutionStatus: currentBalance.ok && warningThreshold.ok ? "not_required" : "unresolved",
      proposedMapping: {
        accountName: "Operating Cash",
        accountKind: "asset",
        openingTransactionKind: "opening_balance",
        currentBalanceMinor: currentBalance.minor,
        warningThresholdMinor: warningThreshold.minor,
        accountNameEditable: true,
        authoritativeHistoryStartsAtCutover: true,
      },
    }),
  );
  if (!currentBalance.ok || !warningThreshold.ok) {
    addDecision(decisions, {
      urgency: "must_resolve_before_import",
      code: "invalid_account_amount",
      sourcePath: "account",
      question: "Correct the malformed current balance or warning floor before a real migration.",
    });
  }

  const scenarios = state.scenarios.map(analyzeScenario);
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.sourceId, scenario]));
  scenarios.forEach((scenario, index) => {
    const sourcePath = `scenarios[${index}]`;
    items.push(
      makeItem(runId, input.row.user_id, {
        sourceType: "scenario",
        sourceId: scenario.sourceId,
        sourcePath,
        proposedTargetType: "scenario",
        proposedTargetId: deterministicUuid(`${runId}:${sourcePath}`),
        classification: scenario.issues.length ? "scenario_needs_review" : "scenario_with_ui_inclusion_preference",
        dataQuality: scenario.issues.length ? "invalid" : "exact",
        ambiguityCode: scenario.issues.length ? "malformed_scenario" : null,
        ambiguityNotes: scenario.issues.join("; ") || null,
        resolutionStatus: scenario.issues.length ? "unresolved" : "not_required",
        proposedMapping: {
          legacyId: scenario.sourceId,
          name: scenario.name,
          description: scenario.description,
          initialComparisonPreference: scenario.includedPreference,
          changesCanonicalBasePlan: false,
        },
      }),
    );
  });

  let settled = 0;
  let unsettled = 0;
  let overdueUnsettled = 0;
  let scenarioEvents = 0;
  let futureIncludedForecastTotalMinor = 0;
  let excludedScenarioForecastTotalMinor = 0;
  const scenarioTotalsMinor: Record<string, number> = {};

  state.events.forEach((rawEvent, index) => {
    const sourcePath = `events[${index}]`;
    const event = analyzeLegacyEvent(rawEvent);
    eventAnalyses.push(event);
    if (event.isSettled === true) settled += 1;
    if (event.isSettled === false) unsettled += 1;
    if (event.scenarioId) scenarioEvents += 1;

    const category = mapLegacyCategory(event.category, event.plannedMinor);
    if (category) categoryMap.set(category.legacyName, category);
    const malformed = event.issues.length > 0;
    const unknownCategory = Boolean(category && !category.isKnown);
    const missingCategory = !category;
    const missingScenario = Boolean(event.scenarioId && !scenarioById.has(event.scenarioId));
    const overdue = event.isSettled === false && Boolean(event.date && event.date < input.migrationDate);
    const zeroAmount = event.plannedAmountValid && event.plannedMinor === 0;

    let classification = "event_needs_review";
    let targetType = "legacy_import_review_item";
    let quality: ProposedImportItem["dataQuality"] = malformed ? "invalid" : "exact";
    let ambiguityCode: string | null = malformed ? "malformed_event" : null;
    let ambiguityNotes = event.issues.join("; ") || null;
    let resolutionStatus: ProposedImportItem["resolutionStatus"] = malformed ? "unresolved" : "not_required";

    if (!malformed && event.isSettled) {
      targetType = "legacy_history_event";
      if (event.actualAmountPresent && event.actualAmountValid) {
        classification = "settled_historical_exact_actual";
      } else if (!event.actualAmountPresent) {
        classification = "settled_historical_planned_amount_only";
        quality = "inferred";
      } else {
        classification = "settled_historical_ambiguous";
        quality = "ambiguous";
        ambiguityCode = "invalid_actual_amount";
        resolutionStatus = "unresolved";
      }
    } else if (!malformed && event.isSettled === false) {
      targetType = "forecast_item";
      if (overdue) {
        classification = "overdue_legacy_forecast_item";
        quality = "ambiguous";
        ambiguityCode = "overdue_unsettled_event";
        ambiguityNotes = "Legacy unsettled event predates the migration date";
        resolutionStatus = "unresolved";
        overdueUnsettled += 1;
        overdueItems.push({
          sourcePath,
          sourceId: event.sourceId,
          label: event.label,
          date: event.date ?? "invalid",
          amountMinor: event.plannedMinor,
        });
      } else {
        classification = event.plannedMinor > 0 ? "candidate_forecast_income" : "candidate_forecast_expense";
      }
    }

    if (!malformed && (missingCategory || zeroAmount || missingScenario || unknownCategory)) {
      quality = "ambiguous";
      ambiguityCode = missingCategory
        ? "missing_category"
        : zeroAmount
          ? "untyped_zero_amount"
          : missingScenario
            ? "unknown_scenario_relationship"
            : "unknown_custom_category";
      ambiguityNotes = missingCategory
        ? "Event has no usable category"
        : zeroAmount
          ? "A zero signed amount cannot be typed as income or expense"
          : missingScenario
            ? "Event references a scenario that is not present"
            : `Custom category ${category?.legacyName ?? "unknown"} will be preserved as a proposed user category`;
      resolutionStatus = "unresolved";
    }

    if (resolutionStatus === "unresolved" && ambiguityCode) {
      const historicalOnly = event.isSettled === true || ambiguityCode === "unknown_custom_category";
      addDecision(decisions, {
        urgency: historicalOnly ? "can_resolve_after_cutover" : "must_resolve_before_import",
        code: ambiguityCode,
        sourcePath,
        question:
          ambiguityCode === "overdue_unsettled_event"
            ? `Choose whether to post, reschedule, skip, or retain overdue item “${event.label}” as reference.`
            : `Review “${event.label}”: ${ambiguityNotes ?? ambiguityCode}.`,
      });
    }

    const scenario = event.scenarioId ? scenarioById.get(event.scenarioId) : null;
    if (!malformed && event.isSettled === false && !overdue && event.date && event.date >= input.migrationDate) {
      if (!event.scenarioId || scenario?.includedPreference === true) {
        futureIncludedForecastTotalMinor += event.plannedMinor;
      } else {
        excludedScenarioForecastTotalMinor += event.plannedMinor;
      }
      if (event.scenarioId) {
        scenarioTotalsMinor[event.scenarioId] = (scenarioTotalsMinor[event.scenarioId] ?? 0) + event.plannedMinor;
      }
    }

    items.push(
      makeItem(runId, input.row.user_id, {
        sourceType: event.scenarioId ? "scenario_event" : "event",
        sourceId: event.sourceId,
        sourcePath,
        proposedTargetType: targetType,
        proposedTargetId: targetType === "legacy_import_review_item" ? null : deterministicUuid(`${runId}:${sourcePath}`),
        classification,
        dataQuality: quality,
        ambiguityCode,
        ambiguityNotes,
        resolutionStatus,
        proposedMapping: {
          legacyId: event.sourceId,
          label: event.label,
          originalSignedAmount: isRecord(rawEvent) ? jsonValue(rawEvent.amount ?? null) : null,
          plannedAmountMinor: event.plannedMinor,
          actualAmountMinor: event.actualMinor,
          date: event.date,
          semanticType: event.plannedMinor > 0 ? "income" : event.plannedMinor < 0 ? "expense" : null,
          category: category ? jsonValue(category) : null,
          notes: event.notes,
          scenarioId: event.scenarioId,
          legacySettled: event.isSettled,
          authoritativeLedgerEffectMinor: 0,
        },
      }),
    );
  });

  let recurringTemplates = 0;
  state.templates.forEach((rawTemplate, index) => {
    const sourcePath = `templates[${index}]`;
    const template = analyzeTemplate(rawTemplate, input.migrationDate);
    if (template.type === "recurring") recurringTemplates += 1;
    const needsReview = template.issues.length > 0 || template.requiresContinuationConfirmation;
    items.push(
      makeItem(runId, input.row.user_id, {
        sourceType: template.type === "recurring" ? "recurring_template" : "single_template",
        sourceId: template.sourceId,
        sourcePath,
        proposedTargetType: template.type === "recurring" ? "recurring_rule_proposal" : "quick_entry_preset",
        proposedTargetId: deterministicUuid(`${runId}:${sourcePath}`),
        classification: template.classification,
        dataQuality: template.issues.length ? "invalid" : template.requiresContinuationConfirmation ? "ambiguous" : "exact",
        ambiguityCode: template.issues.length
          ? "malformed_template"
          : template.requiresContinuationConfirmation
            ? "recurring_continuation_confirmation"
            : null,
        ambiguityNotes: template.issues.join("; ") || (template.requiresContinuationConfirmation ? "Legacy recurrence is finite and will not be extended without confirmation" : null),
        resolutionStatus: needsReview ? "unresolved" : "not_required",
        proposedMapping: {
          legacyId: template.sourceId,
          label: template.label,
          oldStartMonth: template.startMonth,
          oldEndMonth: template.endMonth,
          itemCount: template.itemCount,
          finitePeriodPreserved: true,
          continueIndefinitely: false,
        },
      }),
    );
    if (needsReview) {
      addDecision(decisions, {
        urgency: "must_resolve_before_import",
        code: template.issues.length ? "malformed_template" : "recurring_continuation_confirmation",
        sourcePath,
        question: template.issues.length
          ? `Correct malformed template “${template.label}”: ${template.issues.join("; ")}.`
          : `Confirm whether finite recurring template “${template.label}” should create any future recurring rule.`,
      });
    }

    if (isRecord(rawTemplate) && rawTemplate.type === "recurring" && Array.isArray(rawTemplate.items)) {
      rawTemplate.items.forEach((rawItem, itemIndex) => {
        const itemPath = `${sourcePath}.items[${itemIndex}]`;
        const itemRecord = isRecord(rawItem) ? rawItem : {};
        const amount = legacyAmountToMinor(itemRecord.amount);
        const firstDate = validIsoDate(itemRecord.firstDate) ? itemRecord.firstDate : null;
        const itemIssues = [!amount.ok ? amount.reason : null, !firstDate ? "invalid first date" : null].filter(Boolean) as string[];
        const category = mapLegacyCategory(itemRecord.category, amount.minor);
        if (category) categoryMap.set(category.legacyName, category);
        items.push(
          makeItem(runId, input.row.user_id, {
            sourceType: "recurring_template_item",
            sourceId: normalizeLegacyId(itemRecord.id),
            sourcePath: itemPath,
            proposedTargetType: "recurring_rule_item_proposal",
            proposedTargetId: deterministicUuid(`${runId}:${itemPath}`),
            classification: itemIssues.length ? "recurring_item_needs_review" : "finite_recurring_item",
            dataQuality: itemIssues.length ? "invalid" : "exact",
            ambiguityCode: itemIssues.length ? "malformed_recurring_item" : null,
            ambiguityNotes: itemIssues.join("; ") || null,
            resolutionStatus: itemIssues.length ? "unresolved" : "not_required",
            proposedMapping: {
              label: normalizeText(itemRecord.label),
              originalSignedAmount: jsonValue(itemRecord.amount ?? null),
              amountMinor: amount.minor,
              firstDate,
              category: category ? jsonValue(category) : null,
              notes: optionalString(itemRecord.notes),
              parentTemplatePath: sourcePath,
            },
          }),
        );
      });
    }
  });

  // Source notes are only hints: record possible lineage without suppressing either object.
  const recurringRaw = state.templates.filter((value) => isRecord(value) && value.type === "recurring");
  recurringRaw.forEach((rawTemplate, templateIndex) => {
    if (!isRecord(rawTemplate)) return;
    const label = normalizedComparableText(rawTemplate.label);
    if (!label) return;
    state.events.forEach((rawEvent, eventIndex) => {
      if (!isRecord(rawEvent)) return;
      const notes = normalizedComparableText(rawEvent.notes);
      if (!notes || !notes.includes(label)) return;
      const sourcePath = `derived.template_lineage[${templateIndex}][${eventIndex}]`;
      items.push(
        makeItem(runId, input.row.user_id, {
          sourceType: "template_lineage_hint",
          sourcePath,
          proposedTargetType: "migration_review_only",
          classification: "possible_materialized_recurring_event",
          dataQuality: "ambiguous",
          ambiguityCode: "template_lineage_uncertain",
          ambiguityNotes: "Event notes suggest template lineage, but legacy data has no robust lineage key; nothing was deduplicated",
          resolutionStatus: "unresolved",
          proposedMapping: { templateSourceId: normalizeLegacyId(rawTemplate.id), eventSourceId: normalizeLegacyId(rawEvent.id), autoDeduplicated: false },
        }),
      );
    });
  });

  state.bucketTemplates.forEach((rawTemplate, index) => {
    const sourcePath = `bucketTemplates[${index}]`;
    const record = isRecord(rawTemplate) ? rawTemplate : {};
    const budget = legacyAmountToMinor(record.defaultBudget);
    const bucketCategory = mapLegacyCategory(record.name);
    if (bucketCategory) categoryMap.set(bucketCategory.legacyName, bucketCategory);
    const invalid = !isRecord(rawTemplate) || !budget.ok || !optionalString(record.name);
    items.push(
      makeItem(runId, input.row.user_id, {
        sourceType: "bucket_template",
        sourceId: optionalString(record.name),
        sourcePath,
        proposedTargetType: "budget_line_template_proposal",
        proposedTargetId: deterministicUuid(`${runId}:${sourcePath}`),
        classification: invalid ? "bucket_template_needs_review" : "monthly_budget_template",
        dataQuality: invalid ? "invalid" : "exact",
        ambiguityCode: invalid ? "malformed_bucket_template" : null,
        ambiguityNotes: invalid ? "Bucket template needs a name and valid default budget" : null,
        resolutionStatus: invalid ? "unresolved" : "not_required",
        proposedMapping: {
          name: optionalString(record.name),
          defaultBudgetMinor: budget.minor,
          enabledByDefault: typeof record.isEnabledByDefault === "boolean" ? record.isEnabledByDefault : null,
          mapsToFund: false,
        },
      }),
    );
  });

  let bucketEntries = 0;
  const settledEvents = eventAnalyses.filter((event) => event.isSettled === true);
  Object.entries(state.buckets).sort(([a], [b]) => a.localeCompare(b)).forEach(([month, rawMonth]) => {
    if (!isRecord(rawMonth)) {
      const sourcePath = `buckets[${JSON.stringify(month)}]`;
      items.push(makeItem(runId, input.row.user_id, {
        sourceType: "bucket_month",
        sourcePath,
        proposedTargetType: "budget_period_proposal",
        classification: "malformed_bucket_month",
        dataQuality: "invalid",
        ambiguityCode: "malformed_bucket_month",
        ambiguityNotes: "Bucket month must contain named bucket objects",
        resolutionStatus: "unresolved",
      }));
      return;
    }
    Object.entries(rawMonth).sort(([a], [b]) => a.localeCompare(b)).forEach(([bucketName, rawBucket]) => {
      const sourcePath = `buckets[${JSON.stringify(month)}][${JSON.stringify(bucketName)}]`;
      const bucket = isRecord(rawBucket) ? rawBucket : {};
      const bucketCategory = mapLegacyCategory(bucketName);
      if (bucketCategory) categoryMap.set(bucketCategory.legacyName, bucketCategory);
      const budgeted = legacyAmountToMinor(bucket.budgeted);
      const entries = Array.isArray(bucket.entries) ? bucket.entries : [];
      const invalid = !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isRecord(rawBucket) || !budgeted.ok || !Array.isArray(bucket.entries);
      const spendTotalMinor = entries.reduce((sum, entry) => {
        const analyzed = analyzeBucketEntry(entry);
        return sum + (analyzed.amountValid ? analyzed.amountMinor : 0);
      }, 0);
      items.push(
        makeItem(runId, input.row.user_id, {
          sourceType: "bucket_budget",
          sourceId: `${month}:${bucketName}`,
          sourcePath,
          proposedTargetType: "budget_line_proposal",
          proposedTargetId: deterministicUuid(`${runId}:${sourcePath}`),
          classification: invalid ? "bucket_budget_needs_review" : "monthly_budget_line",
          dataQuality: invalid ? "invalid" : "exact",
          ambiguityCode: invalid ? "malformed_bucket_budget" : null,
          ambiguityNotes: invalid ? "Bucket month, budget, or entries are malformed" : null,
          resolutionStatus: invalid ? "unresolved" : "not_required",
          proposedMapping: {
            month,
            bucketName,
            budgetedMinor: budgeted.minor,
            active: typeof bucket.isActive === "boolean" ? bucket.isActive : null,
            spendTotalMinor,
            mapsToFund: false,
          },
        }),
      );
      entries.forEach((rawEntry, entryIndex) => {
        bucketEntries += 1;
        const entryPath = `${sourcePath}.entries[${entryIndex}]`;
        const entry = analyzeBucketEntry(rawEntry);
        const match = matchBucketEntry(entry, bucketName, settledEvents);
        const invalidEntry = entry.issues.length > 0;
        const ambiguous = match.result !== "unmatched_bucket_spend" || invalidEntry;
        items.push(
          makeItem(runId, input.row.user_id, {
            sourceType: "bucket_spend",
            sourceId: entry.sourceId,
            sourcePath: entryPath,
            proposedTargetType: "legacy_bucket_spend_reference",
            classification: invalidEntry ? "invalid_bucket_spend" : match.result,
            dataQuality: invalidEntry ? "invalid" : ambiguous ? "ambiguous" : "inferred",
            ambiguityCode: invalidEntry ? "malformed_bucket_spend" : match.result,
            ambiguityNotes: invalidEntry ? entry.issues.join("; ") : `Match score ${match.score}; signals: ${match.signals.join(", ") || "none"}`,
            resolutionStatus: "unresolved",
            proposedMapping: {
              month,
              bucketName,
              date: entry.date,
              amountMinor: entry.amountMinor,
              note: entry.note,
              matchedSettledEventId: match.matchedEventId,
              matchScore: match.score,
              matchSignals: match.signals,
              createPostedTransaction: false,
            },
          }),
        );
      });
    });
  });

  const historyCount = Array.isArray(state.ui.history) ? state.ui.history.length : 0;
  items.push(makeItem(runId, input.row.user_id, {
    sourceType: "ui_history",
    sourcePath: "ui.history",
    proposedTargetType: "none",
    classification: "non_financial_activity_history",
    dataQuality: "not_applicable",
    resolutionStatus: "intentionally_ignored",
    proposedMapping: { preservedInBackup: true, entryCount: historyCount, authoritativeLedgerEffectMinor: 0 },
  }));
  items.push(makeItem(runId, input.row.user_id, {
    sourceType: "ui_state",
    sourcePath: "ui.transient",
    proposedTargetType: "none",
    classification: "transient_ui_state",
    dataQuality: "not_applicable",
    resolutionStatus: "intentionally_ignored",
    proposedMapping: { preservedInBackup: true, selectedForecastDate: optionalString(state.ui.selectedDate) },
  }));
  items.push(makeItem(runId, input.row.user_id, {
    sourceType: "legacy_metadata",
    sourcePath: "meta",
    proposedTargetType: "none",
    classification: "legacy_sync_metadata",
    dataQuality: "not_applicable",
    resolutionStatus: "intentionally_ignored",
    proposedMapping: { preservedInBackup: true },
  }));

  rootIssues.forEach((issue, index) => {
    const sourcePath = `validation[${index}]:${issue.path}`;
    items.push(makeItem(runId, input.row.user_id, {
      sourceType: "schema_validation_issue",
      sourcePath,
      proposedTargetType: "migration_review_only",
      classification: "malformed_legacy_section",
      dataQuality: "invalid",
      ambiguityCode: issue.code,
      ambiguityNotes: issue.message,
      resolutionStatus: "unresolved",
    }));
  });

  for (const category of [...categoryMap.values()].sort((a, b) => a.legacyName.localeCompare(b.legacyName))) {
    const sourcePath = `derived.categories[${JSON.stringify(category.legacyName)}]`;
    items.push(
      makeItem(runId, input.row.user_id, {
        sourceType: "derived_category",
        sourceId: category.legacyName,
        sourcePath,
        proposedTargetType: "category",
        proposedTargetId: deterministicUuid(`${runId}:${sourcePath}`),
        classification: category.isKnown ? "explicit_category_mapping" : "preserved_custom_category",
        dataQuality: category.isKnown ? "exact" : "inferred",
        ambiguityCode: category.isKnown ? null : "unknown_custom_category",
        ambiguityNotes: category.isKnown ? null : "Preserved verbatim as a proposed user-created category",
        resolutionStatus: category.isKnown ? "not_required" : "unresolved",
        proposedMapping: {
          legacyName: category.legacyName,
          proposedName: category.proposedName,
          proposedSlug: category.proposedSlug,
          proposedKind: category.proposedKind,
          isKnown: category.isKnown,
        },
      }),
    );
  }

  const lineageHintCount = items.filter((item) => item.classification === "possible_materialized_recurring_event").length;
  if (lineageHintCount > 0) {
    addDecision(decisions, {
      urgency: "can_resolve_after_cutover",
      code: "template_lineage_uncertain",
      sourcePath: "templates",
      question: `Review ${lineageHintCount} possible template/event lineage matches for legacy analytics; no event was suppressed.`,
    });
  }
  const bucketDuplicateCount = items.filter((item) => item.sourceType === "bucket_spend" && (item.classification === "probable_duplicate" || item.classification === "possible_duplicate")).length;
  if (bucketDuplicateCount > 0) {
    addDecision(decisions, {
      urgency: "can_resolve_after_cutover",
      code: "bucket_event_duplicate_review",
      sourcePath: "buckets",
      question: `Review ${bucketDuplicateCount} possible bucket/event duplicates for legacy analytics; none will be posted.`,
    });
  }
  const unmatchedBucketCount = items.filter((item) => item.sourceType === "bucket_spend" && item.classification === "unmatched_bucket_spend").length;
  if (unmatchedBucketCount > 0) {
    addDecision(decisions, {
      urgency: "can_resolve_after_cutover",
      code: "unmatched_bucket_spend_review",
      sourcePath: "buckets",
      question: `Classify ${unmatchedBucketCount} unmatched bucket-spend records for legacy analytics; none will be posted.`,
    });
  }

  const reconciled = reconcileOpeningBalance({
    legacyCurrentBalanceMinor: currentBalance.minor,
    proposedOpeningBalanceMinor: currentBalance.minor,
    warningThresholdLegacyMinor: warningThreshold.minor,
    warningThresholdProposedMinor: warningThreshold.minor,
  });
  const ambiguities = items
    .filter((item) => item.resolutionStatus === "unresolved")
    .map((item) => ({ code: item.ambiguityCode ?? "needs_review", sourcePath: item.sourcePath, notes: item.ambiguityNotes ?? item.classification }));
  const failedItems = items.filter((item) => item.dataQuality === "invalid").length;
  const unmappedItems = items.filter((item) => item.proposedTargetType === "legacy_import_review_item").length;
  const proposedMappings = items.reduce<Record<string, number>>((result, item) => {
    result[item.proposedTargetType] = (result[item.proposedTargetType] ?? 0) + 1;
    return result;
  }, {});

  return {
    reportVersion: "phase-3-v1",
    mode: "dry_run",
    importerVersion: IMPORTER_VERSION,
    targetSchemaVersion: TARGET_SCHEMA_VERSION,
    runId,
    source: {
      userId: input.row.user_id,
      emailEvidence: "known_email_auth_match",
      updatedAt: input.row.updated_at,
      checksum: sourceChecksum,
      migrationDate: input.migrationDate,
      excludedLegacyUserIds: [...input.excludedLegacyUserIds].sort(),
    },
    counts: {
      eventsTotal: state.events.length,
      settled,
      unsettled,
      overdueUnsettled,
      scenarioEvents,
      scenarios: state.scenarios.length,
      templates: state.templates.length,
      recurringTemplates,
      bucketMonths: Object.keys(state.buckets).length,
      bucketEntries,
    },
    proposedMappings,
    categoryMappings: [...categoryMap.values()].sort((a, b) => a.legacyName.localeCompare(b.legacyName)),
    financialVerification: {
      currency: "NOK",
      ...reconciled,
      futureIncludedForecastTotalMinor,
      excludedScenarioForecastTotalMinor,
      scenarioTotalsMinor,
    },
    preservation: {
      sourceItemsClassified: items.filter((item) => item.sourceType !== "derived_category" && item.sourceType !== "template_lineage_hint").length,
      intentionallyIgnored: items.filter((item) => item.resolutionStatus === "intentionally_ignored").length,
      failedItems,
      ambiguousItems: ambiguities.length,
      unmappedItems,
    },
    ambiguities,
    overdueItems,
    decisions: decisions.sort((a, b) => a.urgency.localeCompare(b.urgency) || a.sourcePath.localeCompare(b.sourcePath)),
    items,
  };
}
