import { requireAuthenticatedUserId, requireSupabase, rpcNullable } from "./shared";

export interface PostSplitExpenseCommand {
  sourceAccountId: string;
  amountMinor: number;
  reimbursableMinor: number;
  poolId: string;
  categoryId: string;
  occurredAt: string;
  description: string;
  notes: string | null;
  idempotencyKey: string;
}

export interface RecordReimbursementCommand {
  poolId: string;
  destinationAccountId: string;
  amountMinor: number;
  occurredAt: string;
  notes: string | null;
  idempotencyKey: string;
}

export interface AdjustReimbursementCommand {
  poolId: string;
  totalMinor: number;
  expectedDate: string;
  description: string;
  idempotencyKey: string;
}

export const reimbursementsRepository = {
  async getWorkspace() {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const [pools, entries] = await Promise.all([
      client.from("reimbursement_pools").select("*").eq("user_id", userId).order("created_at"),
      client.from("reimbursement_entries").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }),
    ]);
    if (pools.error) throw pools.error;
    if (entries.error) throw entries.error;
    return { pools: pools.data, entries: entries.data };
  },

  async convertForecastItem(forecastItemId: string): Promise<string> {
    const { data, error } = await requireSupabase().rpc("convert_forecast_item_to_reimbursement_pool", {
      p_forecast_item_id: forecastItemId,
    });
    if (error) throw error;
    return data;
  },

  async postSplitExpense(command: PostSplitExpenseCommand): Promise<string> {
    const { data, error } = await requireSupabase().rpc("post_split_expense", {
      p_source_account_id: command.sourceAccountId,
      p_amount_minor: command.amountMinor,
      p_reimbursable_minor: command.reimbursableMinor,
      p_pool_id: command.poolId,
      p_category_id: command.categoryId,
      p_occurred_at: command.occurredAt,
      p_description: command.description,
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async recordRepayment(command: RecordReimbursementCommand): Promise<string> {
    const { data, error } = await requireSupabase().rpc("record_reimbursement", {
      p_pool_id: command.poolId,
      p_destination_account_id: command.destinationAccountId,
      p_amount_minor: command.amountMinor,
      p_occurred_at: command.occurredAt,
      p_notes: rpcNullable(command.notes),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async adjustPool(command: AdjustReimbursementCommand): Promise<string | null> {
    const { data, error } = await requireSupabase().rpc("adjust_reimbursement_pool", {
      p_pool_id: command.poolId,
      p_total_minor: command.totalMinor,
      p_expected_date: command.expectedDate,
      p_description: command.description,
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },
};
