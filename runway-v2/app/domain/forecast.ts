import type { DateOnly, ForecastItem } from "./types";

export function forecastThrough(
  items: readonly ForecastItem[],
  asOfDate: DateOnly,
  throughDate: DateOnly,
): ForecastItem[] {
  return items.filter((item) => item.date >= asOfDate && item.date <= throughDate).toSorted((a, b) => a.date.localeCompare(b.date));
}

// TODO(phase-2): specify recurring expansion, same-day ordering, and transfer neutrality.
