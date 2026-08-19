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
    const { data, error } = await requireSupabase().from("account_balance_snapshots")
      .select("*")
      .eq("account_id", accountId)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};
