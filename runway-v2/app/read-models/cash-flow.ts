import type { CurrencyCode, DateOnly, MinorUnits } from "~/domain/types";

export interface CashFlowPoint {
  date: DateOnly;
  balanceMinor: MinorUnits;
}

export interface CashFlowReadModel {
  currency: CurrencyCode;
  points: CashFlowPoint[];
}
