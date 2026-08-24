import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRunwayQueryCache, persistRunwayQueryCache, restoreRunwayQueryCache } from "~/data/query-cache";

afterEach(() => { clearRunwayQueryCache(); vi.restoreAllMocks(); });

describe("workspace query cache", () => {
  it("restores successful workspace data for the same user", () => {
    const first = new QueryClient();
    first.setQueryData(["forecast-workspace"], { profile: { base_currency: "NOK" } });
    persistRunwayQueryCache(first, "user-a");
    const restored = new QueryClient();
    restoreRunwayQueryCache(restored, "user-a");
    expect(restored.getQueryData(["forecast-workspace"])).toEqual({ profile: { base_currency: "NOK" } });
  });

  it("does not expose one user's cache to another user", () => {
    const first = new QueryClient();
    first.setQueryData(["funds-workspace"], { funds: [{ name: "Private fund" }] });
    persistRunwayQueryCache(first, "user-a");
    const restored = new QueryClient();
    restoreRunwayQueryCache(restored, "user-b");
    expect(restored.getQueryData(["funds-workspace"])).toBeUndefined();
  });

  it("does not persist unrelated or failed queries", () => {
    const first = new QueryClient();
    first.setQueryData(["temporary-search"], { value: "ignore" });
    persistRunwayQueryCache(first, "user-a");
    const restored = new QueryClient();
    restoreRunwayQueryCache(restored, "user-a");
    expect(restored.getQueryData(["temporary-search"])).toBeUndefined();
  });
});
