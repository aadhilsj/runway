import { z } from "zod";

export const transactionKindSchema = z.enum([
  "income", "expense", "transfer", "refund", "reimbursement", "debt_payment", "opening_balance", "adjustment",
]);
export const allocationModeSchema = z.enum(["manual", "recommended", "automatic"]);
export const allocationFrequencySchema = z.enum(["once", "weekly", "monthly", "on-payday"]);
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const minorUnitsSchema = z.number().int().safe();
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["checking", "savings", "credit", "investment", "cash"]),
  currency: currencyCodeSchema,
  openingBalanceMinor: minorUnitsSchema,
  active: z.boolean(),
});

export const allocationInstructionSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  destinationFundId: z.string().min(1),
  mode: allocationModeSchema,
  amountMinor: minorUnitsSchema.optional(),
  percentageBasisPoints: z.number().int().min(0).max(10_000).optional(),
  frequency: allocationFrequencySchema,
  priority: z.number().int().nonnegative(),
  active: z.boolean(),
  accountFloorMinor: minorUnitsSchema.optional(),
  triggerThresholdMinor: minorUnitsSchema.optional(),
  redirectFundId: z.string().min(1).optional(),
  startsOn: dateOnlySchema,
  endsOn: dateOnlySchema.optional(),
}).superRefine((value, context) => {
  if (value.amountMinor === undefined && value.percentageBasisPoints === undefined) {
    context.addIssue({ code: "custom", message: "An amount or percentage is required" });
  }
});

export const userConfigSchema = z.object({
  baseCurrency: currencyCodeSchema,
  timezone: z.string().min(1),
  accountFloorMinor: minorUnitsSchema,
  forecastHorizonDays: z.number().int().positive(),
  safeWindowDays: z.number().int().nonnegative(),
  defaultAccountId: z.string().min(1).optional(),
  defaultPaydayPlanId: z.string().min(1).optional(),
  preferences: z.object({
    weekStartsOn: z.union([z.literal(1), z.literal(7)]),
    reducedMotion: z.boolean(),
    compactNumbers: z.boolean(),
  }),
});
