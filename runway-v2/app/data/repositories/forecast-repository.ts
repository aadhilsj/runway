import type { Database } from "~/data/database.types";
import { requireAuthenticatedUserId, requireSupabase } from "./shared";

type ForecastInsert = Omit<Database["public"]["Tables"]["forecast_items"]["Insert"], "user_id">;
type ForecastUpdate = Database["public"]["Tables"]["forecast_items"]["Update"];
export interface SettleForecastItemCommand {
  itemId: string; actualAmountMinor: number; occurredAt: string;
  sourceAccountId: string | null; destinationAccountId: string | null;
  categoryId: string | null; notes: string | null; idempotencyKey: string;
}

export const forecastRepository = {
  async getWorkspace() {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const [profile, accounts, balances, items, rules, occurrences, scenarios, categories, transactions, funds, fundBalances, portfolioSnapshots, reimbursementPools, reimbursementEntries] = await Promise.all([
      client.from("profiles").select("*").eq("user_id", userId).single(),
      client.from("accounts").select("*").eq("user_id", userId).is("archived_at", null).order("created_at"),
      client.from("account_balances").select("*").eq("user_id", userId),
      client.from("forecast_items").select("*").eq("user_id", userId).order("expected_date"),
      client.from("recurring_rules").select("*").eq("user_id", userId).is("archived_at", null).order("start_on"),
      client.from("recurring_occurrences").select("*").eq("user_id", userId).order("occurrence_date"),
      client.from("scenarios").select("*").eq("user_id", userId).is("archived_at", null).order("name"),
      client.from("categories").select("*").eq("user_id", userId).is("archived_at", null).order("sort_order"),
      client.from("transactions").select("id, description, occurred_at, kind, status").eq("user_id", userId).eq("status", "posted").order("occurred_at", { ascending: false }).limit(100),
      client.from("funds").select("id,name").eq("user_id",userId).eq("active",true).order("sort_order"),
      client.from("fund_balances").select("fund_id,balance_minor").eq("user_id",userId),
      client.from("portfolio_value_snapshots").select("account_id,value_minor,valued_at,created_at,id").eq("user_id",userId).order("valued_at"),
      client.from("reimbursement_pools").select("*").eq("user_id", userId).order("created_at"),
      client.from("reimbursement_entries").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }),
    ]);
    for (const result of [profile, accounts, balances, items, rules, occurrences, scenarios, categories, transactions, funds, fundBalances, portfolioSnapshots, reimbursementPools, reimbursementEntries]) if (result.error) throw result.error;
    const latestValues = new Map<string,number>();
    for (const row of portfolioSnapshots.data as Array<{account_id:string;value_minor:number}>) latestValues.set(row.account_id, Number(row.value_minor));
    const currentBalances = balances.data!.map((row) => row.account_id && latestValues.has(row.account_id) ? { ...row, display_balance_minor: latestValues.get(row.account_id)! } : row);
    return { profile: profile.data!, accounts: accounts.data!, balances: currentBalances, items: items.data!, rules: rules.data!,
      occurrences: occurrences.data!, scenarios: scenarios.data!, categories: categories.data!, transactions: transactions.data!,
      funds: funds.data as Array<{id:string;name:string}>, fundBalances: fundBalances.data as Array<{fund_id:string;balance_minor:number}>,
      portfolioSnapshots: portfolioSnapshots.data as Array<{account_id:string;value_minor:number;valued_at:string;created_at:string;id:string}>,
      reimbursementPools: reimbursementPools.data!, reimbursementEntries: reimbursementEntries.data! };
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
  async purgeExpiredRecoverableItems(): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { error } = await client.from("forecast_items").delete().eq("user_id", userId).in("status", ["skipped", "canceled"]).lt("updated_at", cutoff).is("legacy_source_id", null); if (error) throw error;
  },
  async matchItem(itemId: string, transactionId: string): Promise<void> {
    const client = requireSupabase(); const { error } = await client.rpc("match_forecast_item", { p_forecast_item_id: itemId, p_transaction_id: transactionId }); if (error) throw error;
  },
  async unmatchItem(itemId: string): Promise<void> {
    const client = requireSupabase(); const { error } = await client.rpc("unmatch_forecast_item", { p_forecast_item_id: itemId }); if (error) throw error;
  },
  async settleItem(command: SettleForecastItemCommand): Promise<string> {
    const client = requireSupabase();
    const { data, error } = await client.rpc("settle_forecast_item", {
      p_forecast_item_id: command.itemId, p_actual_amount_minor: command.actualAmountMinor,
      p_occurred_at: command.occurredAt, p_source_account_id: command.sourceAccountId as string,
      p_destination_account_id: command.destinationAccountId as string, p_category_id: command.categoryId as string,
      p_notes: command.notes as string, p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },
  async saveHorizon(months: number): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("profiles").update({ forecast_horizon_months: months }).eq("user_id", userId); if (error) throw error;
  },
};
