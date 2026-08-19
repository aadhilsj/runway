import {
  createAccountCommandSchema,
  type CreateAccountCommand,
} from "~/domain/ledger-schemas";
import { requireSupabase, rpcNullable } from "./shared";

export const accountsRepository = {
  async listAccounts({ includeSystem = false }: { includeSystem?: boolean } = {}) {
    const client = requireSupabase();
    let query = client.from("accounts").select("*").order("created_at");
    if (!includeSystem) query = query.eq("is_system", false);
    const { data, error } = await query;
    if (error) throw error;
    return data;
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

  async archiveAccount(accountId: string): Promise<void> {
    const client = requireSupabase();
    const { error } = await client.from("accounts").update({ archived_at: new Date().toISOString() }).eq("id", accountId).eq("is_system", false);
    if (error) throw error;
  },
};
