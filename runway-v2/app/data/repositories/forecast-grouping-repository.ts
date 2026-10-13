import type { GroupableForecastKind } from "~/domain/forecast-grouping";
import { requireAuthenticatedUserId, requireSupabase } from "./shared";

export const forecastGroupingRepository = {
  async list(): Promise<{
    aliases: Array<{ kind: GroupableForecastKind; label_key: string; group_key: string }>;
    names: Array<{ kind: GroupableForecastKind; group_key: string; display_name: string }>;
  }> {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const [aliases, names] = await Promise.all([
      client.from("forecast_group_aliases").select("kind,label_key,group_key").eq("user_id", userId),
      client.from("forecast_group_names").select("kind,group_key,display_name").eq("user_id", userId),
    ]);
    if (aliases.error) throw aliases.error;
    if (names.error) throw names.error;
    return {
      aliases: aliases.data.filter((row): row is typeof row & { kind: GroupableForecastKind } => row.kind === "income" || row.kind === "expense"),
      names: names.data.filter((row): row is typeof row & { kind: GroupableForecastKind } => row.kind === "income" || row.kind === "expense"),
    };
  },

  async rename(kind: GroupableForecastKind, groupKey: string, displayName: string): Promise<void> {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("forecast_group_names").upsert(
      { user_id: userId, kind, group_key: groupKey, display_name: displayName.trim() },
      { onConflict: "user_id,kind,group_key" },
    );
    if (error) throw error;
  },

  async merge(kind: GroupableForecastKind, labelKeys: string[], targetGroupKey: string): Promise<void> {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { error } = await client.from("forecast_group_aliases").upsert(
      labelKeys.map((labelKey) => ({ user_id: userId, kind, label_key: labelKey, group_key: targetGroupKey })),
      { onConflict: "user_id,kind,label_key" },
    );
    if (error) throw error;
  },

  async separate(kind: GroupableForecastKind, labelKey: string, displayName: string): Promise<void> {
    const groupKey = `custom:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    await this.merge(kind, [labelKey], groupKey);
    await this.rename(kind, groupKey, displayName);
  },
};
