import { requireAuthenticatedUserId, requireSupabase } from "./shared";

export const investmentsRepository = {
  async getWorkspace() {
    const db = requireSupabase(),
      userId = await requireAuthenticatedUserId(db);
    const [accounts, balances, transactions, snapshots, profile] =
      await Promise.all([
        db
          .from("accounts")
          .select("*")
          .eq("user_id", userId)
          .is("archived_at", null)
          .order("created_at"),
        db.from("account_balances").select("*").eq("user_id", userId),
        db
          .from("transactions")
          .select("*,transaction_entries(*)")
          .eq("user_id", userId)
          .eq("status", "posted")
          .order("occurred_at"),
      db
          .from("portfolio_value_snapshots")
          .select("*")
          .eq("user_id", userId)
          .order("valued_at"),
        db.from("profiles").select("*").eq("user_id", userId).single(),
      ]);
    for (const result of [accounts, balances, transactions, snapshots, profile])
      if (result.error) throw result.error;
    return {
      accounts: accounts.data!,
      balances: balances.data!,
      transactions: transactions.data!,
      snapshots: snapshots.data!,
      profile: profile.data!,
    };
  },
  async createSnapshot(input: {
    accountId: string;
    valueMinor: number;
    valuedAt: string;
    notes: string | null;
  }) {
    const db = requireSupabase(),
      userId = await requireAuthenticatedUserId(db);
    const { error } = await db
      .from("portfolio_value_snapshots")
      .insert({
        user_id: userId,
        account_id: input.accountId,
        value_minor: input.valueMinor,
        valued_at: input.valuedAt,
        source: "manual",
        notes: input.notes,
      });
    if (error) throw error;
  },
  async updateSnapshot(
    id: string,
    input: { valueMinor: number; valuedAt: string; notes: string | null },
  ) {
    const db = requireSupabase(),
      userId = await requireAuthenticatedUserId(db);
    const { error } = await db
      .from("portfolio_value_snapshots")
      .update({
        value_minor: input.valueMinor,
        valued_at: input.valuedAt,
        notes: input.notes,
      })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },
  async removeSnapshot(id: string) {
    const db = requireSupabase(),
      userId = await requireAuthenticatedUserId(db);
    const { error } = await db
      .from("portfolio_value_snapshots")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },
};
