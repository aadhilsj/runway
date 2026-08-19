import { requireSupabase } from "./shared";

export const balancesRepository = {
  async getAccountBalances() {
    const { data, error } = await requireSupabase().from("account_balances").select("*").order("account_id");
    if (error) throw error;
    return data;
  },

  async getCurrentNetWorth(currency?: string) {
    let query = requireSupabase().from("current_net_worth").select("*");
    if (currency) query = query.eq("currency", currency);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
};
