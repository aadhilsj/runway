export type GroupableForecastKind = "income" | "expense";

export interface ForecastGroupingOccurrence {
  id: string;
  label: string;
  kind: GroupableForecastKind;
  date: string;
  amountMinor: number;
  sourceType: "forecast_item" | "recurring_occurrence";
  sourceId: string;
}

export interface ForecastGroupAlias {
  kind: GroupableForecastKind;
  label_key: string;
  group_key: string;
}

export interface ForecastGroupName {
  kind: GroupableForecastKind;
  group_key: string;
  display_name: string;
}

export interface ForecastLabelIdentity {
  labelKey: string;
  autoGroupKey: string;
  defaultGroupName: string;
  cleanLabel: string;
}

export interface ForecastOccurrenceGroup {
  key: string;
  kind: GroupableForecastKind;
  name: string;
  occurrences: ForecastGroupingOccurrence[];
  labelVariants: Array<{ labelKey: string; label: string }>;
  totalMinor: number;
  minimumAmountMinor: number;
  maximumAmountMinor: number;
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const EDGE_MONTH = new RegExp(`^(?:${MONTHS})\\b|\\b(?:${MONTHS})$`, "gi");

function titleCase(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((word) => word === "gpt" ? "GPT" : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function forecastLabelIdentity(label: string): ForecastLabelIdentity {
  const normalized = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/chat\s*-?\s*gpt/g, "chatgpt")
    .replace(/open\s*ai/g, "chatgpt")
    .replace(/anthropic/g, "claude")
    .replace(/[&+]/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const withoutDates = normalized
    .replace(EDGE_MONTH, " ")
    .replace(/^(?:20\d{2}|\d{1,2}(?:st|nd|rd|th)?)\b|\b(?:20\d{2}|\d{1,2}(?:st|nd|rd|th)?)$/gi, " ")
    .replace(/\b(?:monthly|month)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || normalized || "planned item";
  const tokens = new Set(withoutDates.split(" "));

  if (tokens.has("salary")) return { labelKey: "salary", autoGroupKey: "salary", defaultGroupName: "Salary", cleanLabel: "Salary" };
  if (tokens.has("rent")) return { labelKey: "rent", autoGroupKey: "rent", defaultGroupName: "Rent", cleanLabel: "Rent" };

  const hasChatGpt = tokens.has("chatgpt") || tokens.has("gpt");
  const hasClaude = tokens.has("claude");
  if (hasChatGpt || hasClaude) {
    const labelKey = hasChatGpt && hasClaude ? "chatgpt-claude" : hasChatGpt ? "chatgpt" : "claude";
    const cleanLabel = hasChatGpt && hasClaude ? "ChatGPT & Claude" : hasChatGpt ? "ChatGPT" : "Claude";
    return { labelKey, autoGroupKey: "ai-tools", defaultGroupName: "ChatGPT & Claude", cleanLabel };
  }

  const key = withoutDates.replace(/\s+/g, "-");
  return { labelKey: key, autoGroupKey: key, defaultGroupName: titleCase(withoutDates), cleanLabel: titleCase(withoutDates) };
}

export function groupForecastOccurrences(
  occurrences: readonly ForecastGroupingOccurrence[],
  aliases: readonly ForecastGroupAlias[],
  names: readonly ForecastGroupName[],
): ForecastOccurrenceGroup[] {
  const aliasMap = new Map(aliases.map((row) => [`${row.kind}:${row.label_key}`, row.group_key]));
  const nameMap = new Map(names.map((row) => [`${row.kind}:${row.group_key}`, row.display_name]));
  const grouped = new Map<string, ForecastOccurrenceGroup>();

  for (const occurrence of occurrences) {
    const identity = forecastLabelIdentity(occurrence.label);
    const groupKey = aliasMap.get(`${occurrence.kind}:${identity.labelKey}`) ?? identity.autoGroupKey;
    const key = `${occurrence.kind}:${groupKey}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.occurrences.push(occurrence);
      existing.totalMinor += occurrence.amountMinor;
      existing.minimumAmountMinor = Math.min(existing.minimumAmountMinor, occurrence.amountMinor);
      existing.maximumAmountMinor = Math.max(existing.maximumAmountMinor, occurrence.amountMinor);
      if (!existing.labelVariants.some((variant) => variant.labelKey === identity.labelKey)) existing.labelVariants.push({ labelKey: identity.labelKey, label: identity.cleanLabel });
      continue;
    }
    grouped.set(key, {
      key: groupKey,
      kind: occurrence.kind,
      name: nameMap.get(key) ?? identity.defaultGroupName,
      occurrences: [occurrence],
      labelVariants: [{ labelKey: identity.labelKey, label: identity.cleanLabel }],
      totalMinor: occurrence.amountMinor,
      minimumAmountMinor: occurrence.amountMinor,
      maximumAmountMinor: occurrence.amountMinor,
    });
  }

  return [...grouped.values()].map((group) => ({
    ...group,
    occurrences: group.occurrences.toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    labelVariants: group.labelVariants.toSorted((a, b) => a.label.localeCompare(b.label)),
  })).toSorted((a, b) => a.occurrences[0]!.date.localeCompare(b.occurrences[0]!.date) || a.name.localeCompare(b.name));
}
