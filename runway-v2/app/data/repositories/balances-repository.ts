import { requireAuthenticatedUserId, requireSupabase } from "./shared";

export const balancesRepository = {
  async getAccountBalances() {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("account_balances").select("*").eq("user_id", userId).order("account_id");
    if (error) throw error;
    return data;
  },

  async getCurrentNetWorth(currency?: string) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    let query = client.from("current_net_worth").select("*").eq("user_id", userId);
    if (currency) query = query.eq("currency", currency);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
};
