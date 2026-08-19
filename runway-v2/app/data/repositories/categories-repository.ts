import type { Database } from "../database.types";
import { requireAuthenticatedUserId, requireSupabase } from "./shared";

type CategoryKind = Database["public"]["Enums"]["runway_category_kind"];

export const categoriesRepository = {
  async listCategories(kind?: CategoryKind) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    let query = client.from("categories").select("*").eq("user_id", userId).is("archived_at", null).order("sort_order").order("name");
    if (kind) query = query.eq("kind", kind);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async createCategory(input: { name: string; kind: CategoryKind; parentId?: string | null; sortOrder?: number }) {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("categories").insert({
      user_id: userId,
      name: input.name.trim(),
      kind: input.kind,
      parent_id: input.parentId ?? null,
      sort_order: input.sortOrder ?? 0,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async archiveCategory(categoryId: string): Promise<void> {
    const client = requireSupabase();
    const { error } = await client.from("categories").update({ archived_at: new Date().toISOString() }).eq("id", categoryId).eq("is_system", false);
    if (error) throw error;
  },
};
