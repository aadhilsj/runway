import type { Database } from "~/data/database.types";
import { requireAuthenticatedUserId, requireSupabase } from "./shared";

type RuleInsert = Omit<Database["public"]["Tables"]["recurring_rules"]["Insert"], "user_id">;
type RuleUpdate = Database["public"]["Tables"]["recurring_rules"]["Update"];
export interface SettleRecurringOccurrenceCommand {
  ruleId: string; occurrenceDate: string; actualAmountMinor: number; occurredAt: string;
  sourceAccountId: string | null; destinationAccountId: string | null;
  categoryId: string | null; notes: string | null; idempotencyKey: string;
}

export const recurringRepository = {
  async list() { const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client); const { data, error } = await client.from("recurring_rules").select("*").eq("user_id", userId).is("archived_at", null).order("start_on"); if (error) throw error; return data; },
  async create(input: RuleInsert): Promise<void> { const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client); const { error } = await client.from("recurring_rules").insert({ ...input, user_id: userId }); if (error) throw error; },
  async update(id: string, input: RuleUpdate): Promise<void> { const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client); const { error } = await client.from("recurring_rules").update(input).eq("id", id).eq("user_id", userId); if (error) throw error; },
  async setActive(id: string, active: boolean): Promise<void> { return this.update(id, { active }); },
  async archive(id: string): Promise<void> { return this.update(id, { active: false, archived_at: new Date().toISOString() }); },
  async setException(ruleId: string, occurrenceDate: string, input: { status: "skipped" | "overridden"; override_date?: string | null; override_amount_minor?: number | null }): Promise<void> {
    const client = requireSupabase(); const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("recurring_occurrences").upsert({ user_id: userId, recurring_rule_id: ruleId, occurrence_date: occurrenceDate, ...input }, { onConflict: "recurring_rule_id,occurrence_date" }); if (error) throw error;
  },
  async matchOccurrence(ruleId: string, occurrenceDate: string, transactionId: string): Promise<void> { const client = requireSupabase(); const { error } = await client.rpc("match_recurring_occurrence", { p_recurring_rule_id: ruleId, p_occurrence_date: occurrenceDate, p_transaction_id: transactionId }); if (error) throw error; },
  async settleOccurrence(command: SettleRecurringOccurrenceCommand): Promise<string> {
    const client = requireSupabase();
    const { data, error } = await client.rpc("settle_recurring_occurrence", {
      p_recurring_rule_id: command.ruleId, p_occurrence_date: command.occurrenceDate,
      p_actual_amount_minor: command.actualAmountMinor, p_occurred_at: command.occurredAt,
      p_source_account_id: command.sourceAccountId, p_destination_account_id: command.destinationAccountId,
      p_category_id: command.categoryId, p_notes: command.notes, p_idempotency_key: command.idempotencyKey,
    });
    if (error) throw error;
    return data;
  },
};
