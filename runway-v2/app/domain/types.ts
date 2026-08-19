export type CurrencyCode = string;
export type MinorUnits = number & { readonly __brand: "MinorUnits" };
export type DateOnly = string & { readonly __brand: "DateOnly" };

export interface Money {
  amountMinor: MinorUnits;
  currency: CurrencyCode;
}

export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "cash";
  currency: CurrencyCode;
  openingBalanceMinor: MinorUnits;
  active: boolean;
}

export type TransactionKind = "income" | "expense" | "transfer" | "adjustment";

export interface Transaction {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  bookedOn: DateOnly;
  description: string;
  categoryId?: string;
  transferPairId?: string;
}

export interface Entry {
  id: string;
  transactionId: string;
  accountId: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
}

export interface Fund {
  id: string;
  name: string;
  balanceMinor: MinorUnits;
  currency: CurrencyCode;
  goalId?: string;
}

export interface Goal {
  id: string;
  name: string;
  targetMinor: MinorUnits;
  preferredContributionMinor?: MinorUnits;
  contributionCapMinor?: MinorUnits;
  currency: CurrencyCode;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  completion: number;
  targetDate?: DateOnly;
}

export interface Budget {
  id: string;
  categoryId: string;
  period: "week" | "month" | "year";
  limitMinor: MinorUnits;
  currency: CurrencyCode;
  active: boolean;
}

export interface ForecastItem {
  id: string;
  date: DateOnly;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  kind: TransactionKind;
  source: "transaction" | "recurring-rule" | "scenario";
  sourceId: string;
}

export interface RecurringRule {
  id: string;
  name: string;
  amountMinor: MinorUnits;
  currency: CurrencyCode;
  kind: "income" | "expense" | "transfer";
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  startsOn: DateOnly;
  endsOn?: DateOnly;
  active: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  active: boolean;
  items: ForecastItem[];
}

export type AllocationMode = "manual" | "recommended" | "automatic";
export type AllocationFrequency = "once" | "weekly" | "monthly" | "on-payday";

export interface AllocationInstruction {
  id: string;
  planId: string;
  destinationFundId: string;
  mode: AllocationMode;
  amountMinor?: MinorUnits;
  percentageBasisPoints?: number;
  frequency: AllocationFrequency;
  priority: number;
  active: boolean;
  accountFloorMinor?: MinorUnits;
  triggerThresholdMinor?: MinorUnits;
  redirectFundId?: string;
  startsOn: DateOnly;
  endsOn?: DateOnly;
}

export type AllocationRule = AllocationInstruction;

export interface AllocationPlan {
  id: string;
  name: string;
  defaultAccountId: string;
  instructions: AllocationInstruction[];
  active: boolean;
}

export interface UserConfig {
  baseCurrency: CurrencyCode;
  timezone: string;
  accountFloorMinor: MinorUnits;
  forecastHorizonDays: number;
  safeWindowDays: number;
  defaultAccountId?: string;
  defaultPaydayPlanId?: string;
  preferences: {
    weekStartsOn: 1 | 7;
    reducedMotion: boolean;
    compactNumbers: boolean;
  };
}
