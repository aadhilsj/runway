import { describe, expect, it } from "vitest";
import { allocationInstructionSchema, allocationModeSchema, dateOnlySchema } from "~/domain/schemas";
import { createAccountCommandSchema, postTransferCommandSchema } from "~/domain/ledger-schemas";

describe("domain schemas", () => {
  it.each(["manual", "recommended", "automatic"])("accepts allocation mode %s", (mode) => {
    expect(allocationModeSchema.parse(mode)).toBe(mode);
  });

  it("requires a date-only value", () => {
    expect(dateOnlySchema.safeParse("2030-01-31").success).toBe(true);
    expect(dateOnlySchema.safeParse("2030-01-31T12:00:00Z").success).toBe(false);
  });

  it("requires an amount or percentage on an allocation", () => {
    const result = allocationInstructionSchema.safeParse({
      id: "instruction", planId: "plan", destinationFundId: "fund", mode: "manual",
      frequency: "once", priority: 0, active: true, startsOn: "2030-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("validates account class, subtype, and optional opening balance together", () => {
    const base = {
      name: "Account", currency: "NOK", includeInNetWorth: true, valuationMode: "ledger",
      idempotencyKey: "account-command",
    } as const;
    expect(createAccountCommandSchema.safeParse({
      ...base, class: "asset", subtype: "checking", liquidityClass: "operating",
      openingBalanceMinor: 100, openingOccurredAt: "2030-01-01T00:00:00Z",
    }).success).toBe(true);
    expect(createAccountCommandSchema.safeParse({
      ...base, class: "asset", subtype: "credit_card", liquidityClass: "operating",
    }).success).toBe(false);
  });

  it("rejects zero transfers and identical accounts", () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    expect(postTransferCommandSchema.safeParse({
      sourceAccountId: accountId, destinationAccountId: accountId, amountMinor: 0,
      occurredAt: "2030-01-01T00:00:00Z", description: "Transfer", idempotencyKey: "transfer",
    }).success).toBe(false);
  });
});
