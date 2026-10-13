import type { EventAnalysis } from "./event-mapping.ts";
import { isRecord, optionalString, validIsoDate } from "./legacy-schema.ts";
import { legacyAmountToMinor } from "./money.ts";
import { normalizeLegacyId, normalizedComparableText } from "./normalization.ts";

export interface BucketEntryAnalysis {
  sourceId: string | null;
  date: string | null;
  amountMinor: number;
  amountValid: boolean;
  note: string | null;
  issues: string[];
}

export interface BucketDuplicateMatch {
  result: "probable_duplicate" | "possible_duplicate" | "unmatched_bucket_spend" | "insufficient_information";
  matchedEventId: string | null;
  score: number;
  signals: string[];
}

export function analyzeBucketEntry(value: unknown): BucketEntryAnalysis {
  if (!isRecord(value)) {
    return { sourceId: null, date: null, amountMinor: 0, amountValid: false, note: null, issues: ["bucket entry is not an object"] };
  }
  const issues: string[] = [];
  const amount = legacyAmountToMinor(value.amount);
  const date = validIsoDate(value.date) ? value.date : null;
  if (!amount.ok) issues.push(amount.reason ?? "invalid bucket amount");
  if (!date) issues.push("invalid bucket entry date");
  return {
    sourceId: normalizeLegacyId(value.id),
    date,
    amountMinor: amount.minor,
    amountValid: amount.ok,
    note: optionalString(value.note),
    issues,
  };
}

export function matchBucketEntry(
  entry: BucketEntryAnalysis,
  bucketName: string,
  settledEvents: EventAnalysis[],
): BucketDuplicateMatch {
  if (!entry.amountValid || !entry.date) {
    return { result: "insufficient_information", matchedEventId: null, score: 0, signals: [] };
  }

  let best: { event: EventAnalysis; score: number; signals: string[] } | null = null;
  for (const event of settledEvents) {
    let score = 0;
    const signals: string[] = [];
    const eventMinor = event.actualMinor ?? event.plannedMinor;
    if (event.date === entry.date) {
      score += 2;
      signals.push("same_date");
    }
    if (Math.abs(eventMinor) === Math.abs(entry.amountMinor)) {
      score += 2;
      signals.push("same_amount");
    }
    if (event.category?.toLocaleLowerCase("en") === bucketName.toLocaleLowerCase("en")) {
      score += 1;
      signals.push("compatible_category");
    }
    const note = normalizedComparableText(entry.note);
    const label = normalizedComparableText(event.label);
    if (note && label && (note.includes(label) || label.includes(note))) {
      score += 1;
      signals.push("related_notes");
    }
    if (!best || score > best.score) best = { event, score, signals };
  }

  if (!best || best.score < 3) {
    return { result: "unmatched_bucket_spend", matchedEventId: null, score: best?.score ?? 0, signals: best?.signals ?? [] };
  }
  return {
    result: best.score >= 5 ? "probable_duplicate" : "possible_duplicate",
    matchedEventId: best.event.sourceId,
    score: best.score,
    signals: best.signals,
  };
}
