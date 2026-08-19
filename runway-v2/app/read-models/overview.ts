import type { CurrencyCode, DateOnly, MinorUnits } from "~/domain/types";

export interface OverviewReadModel {
  asOfDate: DateOnly;
  currency: CurrencyCode;
  availableMinor: MinorUnits;
  netWorthMinor: MinorUnits;
  nextThirtyDaysMinor: MinorUnits;
}
