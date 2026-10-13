import {
  createAccountCommandSchema,
  type CreateAccountCommand,
} from "~/domain/ledger-schemas";
import { requireAuthenticatedUserId, requireSupabase, rpcNullable } from "./shared";

export const accountsRepository = {
  async listAccounts({ includeSystem = false }: { includeSystem?: boolean } = {}) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    let query = client.from("accounts").select("*").eq("user_id", userId).eq("hidden_from_accounts", false).order("created_at");
    if (!includeSystem) query = query.eq("is_system", false);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async listAccountsWithBalances() {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const [accountsResult, balancesResult] = await Promise.all([
      client.from("accounts").select("*").eq("user_id", userId).eq("is_system", false).eq("hidden_from_accounts", false).order("created_at"),
      client.from("account_balances").select("*").eq("user_id", userId),
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (balancesResult.error) throw balancesResult.error;
    const balances = new Map(balancesResult.data.map((row) => [row.account_id, row]));
    return accountsResult.data.map((account) => ({
      ...account,
      ledger_balance_minor: Number(balances.get(account.id)?.ledger_balance_minor ?? 0),
      display_balance_minor: Number(balances.get(account.id)?.display_balance_minor ?? 0),
    }));
  },

  async createAccount(input: CreateAccountCommand): Promise<string> {
    const command = createAccountCommandSchema.parse(input);
    const client = requireSupabase();
    const { data, error } = await client.rpc("create_account", {
      p_name: command.name,
      p_class: command.class,
      p_subtype: command.subtype,
      p_currency: command.currency,
      p_include_in_net_worth: command.includeInNetWorth,
      p_liquidity_class: command.liquidityClass,
      p_valuation_mode: command.valuationMode,
      p_opened_on: rpcNullable(command.openedOn),
      p_opening_balance_minor: (command.openingBalanceMinor ?? null) as unknown as number,
      p_opening_occurred_at: rpcNullable(command.openingOccurredAt),
      p_opening_description: rpcNullable(command.openingDescription),
      p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },

  async deleteAccount(accountId: string): Promise<void> {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("accounts").delete()
      .eq("id", accountId).eq("user_id", userId).eq("is_system", false)
      .select("id").maybeSingle();
    if (error?.code === "23503") {
      throw new Error("This account has financial history and cannot be deleted.");
    }
    if (error) throw error;
    if (!data) throw new Error("This account could not be found or cannot be deleted.");
  },

  async renameAccount(accountId: string, name: string): Promise<void> {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("accounts").update({ name: name.trim() })
      .eq("id", accountId).eq("user_id", userId).eq("is_system", false);
    if (error) throw error;
  },

  async listAccountTransactions(accountId: string) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("transaction_entries")
      .select("*, transactions(*)")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};
