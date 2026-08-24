import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { getSupabaseClient } from "../supabase";

export function requireSupabase(): SupabaseClient<Database> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

export async function requireAuthenticatedUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) throw new Error("Authentication required");
  return data.session.user.id;
}

// Generated PostgREST function args do not include null even when the SQL parameter accepts it.
// This keeps that boundary in one place while sending an actual JSON null to the RPC.
export function rpcNullable(value: string | null | undefined): string {
  return (value ?? null) as unknown as string;
}
