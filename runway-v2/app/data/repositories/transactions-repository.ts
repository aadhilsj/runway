import {
  postDebtPaymentCommandSchema,
  postExpenseCommandSchema,
  postIncomeCommandSchema,
  postOpeningBalanceCommandSchema,
  postTransferCommandSchema,
  reverseTransactionCommandSchema,
  type PostDebtPaymentCommand,
  type PostExpenseCommand,
  type PostIncomeCommand,
  type PostOpeningBalanceCommand,
  type PostTransferCommand,
  type ReverseTransactionCommand,
} from "~/domain/ledger-schemas";
import { requireSupabase, rpcNullable } from "./shared";

export const transactionsRepository = {
  async listTransactions({ limit = 100 }: { limit?: number } = {}) {
    const client = requireSupabase();
    const { data, error } = await client.from("transactions")
      .select("*, transaction_entries(*)")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async postIncome(input: PostIncomeCommand): Promise<string> {
    const command = postIncomeCommandSchema.parse(input);
    const { data, error } = await requireSupabase().rpc("post_income", {
      p_destination_account_id: command.accountId,
      p_amount_minor: command.amountMinor,
      p_category_id: rpcNullable(command.categoryId),
      p_occurred_at: command.occurredAt,
      p_description: command.description,
      p_merchant_or_source: rpcNullable(command.merchantOrSource),
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async postExpense(input: PostExpenseCommand): Promise<string> {
    const command = postExpenseCommandSchema.parse(input);
    const { data, error } = await requireSupabase().rpc("post_expense", {
      p_source_account_id: command.accountId,
      p_amount_minor: command.amountMinor,
      p_category_id: rpcNullable(command.categoryId),
      p_occurred_at: command.occurredAt,
      p_description: command.description,
      p_merchant_or_source: rpcNullable(command.merchantOrSource),
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async postTransfer(input: PostTransferCommand): Promise<string> {
    const command = postTransferCommandSchema.parse(input);
    const { data, error } = await requireSupabase().rpc("post_transfer", {
      p_source_account_id: command.sourceAccountId,
      p_destination_account_id: command.destinationAccountId,
      p_amount_minor: command.amountMinor,
      p_occurred_at: command.occurredAt,
      p_description: command.description,
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async postDebtPayment(input: PostDebtPaymentCommand): Promise<string> {
    const command = postDebtPaymentCommandSchema.parse(input);
    const { data, error } = await requireSupabase().rpc("post_debt_payment", {
      p_source_account_id: command.sourceAccountId,
      p_liability_account_id: command.liabilityAccountId,
      p_principal_minor: command.principalMinor,
      p_occurred_at: command.occurredAt,
      p_description: command.description,
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async postOpeningBalance(input: PostOpeningBalanceCommand): Promise<string> {
    const command = postOpeningBalanceCommandSchema.parse(input);
    const { data, error } = await requireSupabase().rpc("post_opening_balance", {
      p_account_id: command.accountId,
      p_balance_minor: command.balanceMinor,
      p_occurred_at: command.occurredAt,
      p_description: command.description,
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async reverseTransaction(input: ReverseTransactionCommand): Promise<string> {
    const command = reverseTransactionCommandSchema.parse(input);
    const { data, error } = await requireSupabase().rpc("reverse_transaction", {
      p_transaction_id: command.transactionId,
      p_occurred_at: command.occurredAt,
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },
};
