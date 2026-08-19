import type { Database } from "~/data/database.types";
import { requireAuthenticatedUserId, requireSupabase } from "./shared";

type ForecastInsert = Omit<Database["public"]["Tables"]["forecast_items"]["Insert"], "user_id">;
type ForecastUpdate = Database["public"]["Tables"]["forecast_items"]["Update"];

export const forecastRepository = {
  async getWorkspace() {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const [profile, accounts, balances, items, rules, occurrences, scenarios, categories, transactions] = await Promise.all([
      client.from("profiles").select("*").eq("user_id", userId).single(),
      client.from("accounts").select("*").eq("user_id", userId).is("archived_at", null).order("created_at"),
      client.from("account_balances").select("*").eq("user_id", userId),
      client.from("forecast_items").select("*").eq("user_id", userId).order("expected_date"),
      client.from("recurring_rules").select("*").eq("user_id", userId).is("archived_at", null).order("start_on"),
      client.from("recurring_occurrences").select("*").eq("user_id", userId).order("occurrence_date"),
      client.from("scenarios").select("*").eq("user_id", userId).is("archived_at", null).order("name"),
      client.from("categories").select("*").eq("user_id", userId).is("archived_at", null).order("sort_order"),
      client.from("transactions").select("id, description, occurred_at, kind, status").eq("user_id", userId).eq("status", "posted").order("occurred_at", { ascending: false }).limit(100),
    ]);
    for (const result of [profile, accounts, balances, items, rules, occurrences, scenarios, categories, transactions]) if (result.error) throw result.error;
    return { profile: profile.data!, accounts: accounts.data!, balances: balances.data!, items: items.data!, rules: rules.data!,
      occurrences: occurrences.data!, scenarios: scenarios.data!, categories: categories.data!, transactions: transactions.data! };
  },

  async listExpectedItems() { const workspace = await this.getWorkspace(); return workspace.items.filter((item) => item.status === "expected"); },
  async createItem(input: ForecastInsert): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("forecast_items").insert({ ...input, user_id: userId }); if (error) throw error;
  },
  async updateItem(id: string, input: ForecastUpdate): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("forecast_items").update(input).eq("id", id).eq("user_id", userId); if (error) throw error;
  },
  async removeItem(id: string): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("forecast_items").delete().eq("id", id).eq("user_id", userId).is("legacy_source_id", null); if (error) throw error;
  },
  async matchItem(itemId: string, transactionId: string): Promise<void> {
    const client = requireSupabase(); const { error } = await client.rpc("match_forecast_item", { p_forecast_item_id: itemId, p_transaction_id: transactionId }); if (error) throw error;
  },
  async unmatchItem(itemId: string): Promise<void> {
    const client = requireSupabase(); const { error } = await client.rpc("unmatch_forecast_item", { p_forecast_item_id: itemId }); if (error) throw error;
  },
  async saveHorizon(months: number): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("profiles").update({ forecast_horizon_months: months }).eq("user_id", userId); if (error) throw error;
  },
};
