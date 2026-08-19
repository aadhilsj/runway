import {
  createBalanceSnapshotCommandSchema,
  type CreateBalanceSnapshotCommand,
} from "~/domain/ledger-schemas";
import { requireAuthenticatedUserId, requireSupabase } from "./shared";

export const snapshotsRepository = {
  async createBalanceSnapshot(input: CreateBalanceSnapshotCommand) {
    const command = createBalanceSnapshotCommandSchema.parse(input);
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("account_balance_snapshots").insert({
      user_id: userId,
      account_id: command.accountId,
      observed_at: command.observedAt,
      balance_minor: command.balanceMinor,
      source: command.source,
      notes: command.notes ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async getLatestBalanceSnapshot(accountId: string) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("account_balance_snapshots")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async listBalanceSnapshots(accountId: string) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("account_balance_snapshots")
      .select("*").eq("user_id", userId).eq("account_id", accountId)
      .order("observed_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async reconcileAccount(input: {
    accountId: string;
    observedBalanceMinor: number;
    observedAt: string;
    notes?: string | null;
    createAdjustment: boolean;
    idempotencyKey?: string | null;
  }) {
    const { data, error } = await requireSupabase().rpc("reconcile_account", {
      p_account_id: input.accountId,
      p_observed_balance_minor: input.observedBalanceMinor,
      p_observed_at: input.observedAt,
      p_notes: input.notes ?? "",
      p_create_adjustment: input.createAdjustment,
      p_idempotency_key: input.idempotencyKey ?? "",
    });
    if (error) throw error;
    return data;
  },
};
