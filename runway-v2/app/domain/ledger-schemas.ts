import { z } from "zod";

const uuidSchema = z.string().uuid();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const occurredAtSchema = z.string().datetime({ offset: true });
const positiveMinorSchema = z.number().int().safe().positive();
const descriptionSchema = z.string().trim().min(1).max(240);
const notesSchema = z.string().max(4_000).nullable().optional();
const idempotencyKeySchema = z.string().min(1).max(120);

export const createAccountCommandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  class: z.enum(["asset", "liability"]),
  subtype: z.enum(["checking", "savings", "cash", "investment", "credit_card", "loan"]),
  currency: currencySchema,
  includeInNetWorth: z.boolean(),
  liquidityClass: z.enum(["operating", "liquid", "invested", "liability", "non_liquid"]),
  valuationMode: z.enum(["ledger", "manual_market_value"]),
  openedOn: z.string().date().nullable().optional(),
  openingBalanceMinor: positiveMinorSchema.nullable().optional(),
  openingOccurredAt: occurredAtSchema.nullable().optional(),
  openingDescription: descriptionSchema.nullable().optional(),
  idempotencyKey: idempotencyKeySchema,
}).superRefine((value, context) => {
  if ((value.openingBalanceMinor == null) !== (value.openingOccurredAt == null)) {
    context.addIssue({ code: "custom", message: "Opening amount and occurrence time must be provided together" });
  }
  const liabilitySubtype = value.subtype === "credit_card" || value.subtype === "loan";
  if ((value.class === "liability") !== liabilitySubtype) {
    context.addIssue({ code: "custom", message: "Account class and subtype do not match", path: ["subtype"] });
  }
  if ((value.class === "liability") !== (value.liquidityClass === "liability")) {
    context.addIssue({ code: "custom", message: "Liability accounts require liability liquidity", path: ["liquidityClass"] });
  }
});

const categorizedCommand = z.object({
  accountId: uuidSchema,
  amountMinor: positiveMinorSchema,
  categoryId: uuidSchema.nullable().optional(),
  occurredAt: occurredAtSchema,
  description: descriptionSchema,
  merchantOrSource: z.string().max(240).nullable().optional(),
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const postIncomeCommandSchema = categorizedCommand;
export const postExpenseCommandSchema = categorizedCommand;

export const postTransferCommandSchema = z.object({
  sourceAccountId: uuidSchema,
  destinationAccountId: uuidSchema,
  amountMinor: positiveMinorSchema,
  occurredAt: occurredAtSchema,
  description: descriptionSchema,
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
}).refine((value) => value.sourceAccountId !== value.destinationAccountId, {
  message: "Source and destination accounts must differ",
  path: ["destinationAccountId"],
});

export const postDebtPaymentCommandSchema = z.object({
  sourceAccountId: uuidSchema,
  liabilityAccountId: uuidSchema,
  principalMinor: positiveMinorSchema,
  occurredAt: occurredAtSchema,
  description: descriptionSchema,
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const postOpeningBalanceCommandSchema = z.object({
  accountId: uuidSchema,
  balanceMinor: positiveMinorSchema,
  occurredAt: occurredAtSchema,
  description: descriptionSchema,
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const reverseTransactionCommandSchema = z.object({
  transactionId: uuidSchema,
  occurredAt: occurredAtSchema,
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const createBalanceSnapshotCommandSchema = z.object({
  accountId: uuidSchema,
  observedAt: occurredAtSchema,
  balanceMinor: z.number().int().safe(),
  source: z.enum(["manual", "statement", "migration"]),
  notes: z.string().max(2_000).nullable().optional(),
});

export type CreateAccountCommand = z.infer<typeof createAccountCommandSchema>;
export type PostIncomeCommand = z.infer<typeof postIncomeCommandSchema>;
export type PostExpenseCommand = z.infer<typeof postExpenseCommandSchema>;
export type PostTransferCommand = z.infer<typeof postTransferCommandSchema>;
export type PostDebtPaymentCommand = z.infer<typeof postDebtPaymentCommandSchema>;
export type PostOpeningBalanceCommand = z.infer<typeof postOpeningBalanceCommandSchema>;
export type ReverseTransactionCommand = z.infer<typeof reverseTransactionCommandSchema>;
export type CreateBalanceSnapshotCommand = z.infer<typeof createBalanceSnapshotCommandSchema>;
