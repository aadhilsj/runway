import { requireAuthenticatedUserId, requireSupabase } from "./shared";

export const forecastRepository = {
  async listExpectedItems() {
    const client = requireSupabase();
    const userId = await requireAuthenticatedUserId(client);
    const { data, error } = await client.from("forecast_items")
      .select("*, categories(name), scenarios(name)")
      .eq("user_id", userId)
      .eq("status", "expected")
      .order("expected_date");
    if (error) throw error;
    return data;
  },
};
