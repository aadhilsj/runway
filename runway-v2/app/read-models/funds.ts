import type { CurrencyCode, MinorUnits } from "~/domain/types";

export interface FundProgressReadModel {
  id: string;
  name: string;
  currency: CurrencyCode;
  balanceMinor: MinorUnits;
  targetMinor?: MinorUnits;
  completion: number;
}
