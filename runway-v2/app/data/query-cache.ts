import { dehydrate, hydrate, type DehydratedState, type QueryClient } from "@tanstack/react-query";

const cacheKey = "runway:workspace-query-cache:v1";
const maxAgeMs = 12 * 60 * 60 * 1000;
const persistedWorkspaceKeys = new Set([
  "analytics-workspace", "forecast-workspace", "budget-workspace", "funds-workspace", "plans-workspace",
  "payday-workspace", "investments-workspace", "transactions", "accounts", "net-worth", "categories",
]);

type StoredCache = { userId: string; savedAt: number; state: DehydratedState };

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function restoreRunwayQueryCache(queryClient: QueryClient, userId: string): void {
  const target = storage();
  if (!target) return;
  try {
    const raw = target.getItem(cacheKey);
    if (!raw) return;
    const cached = JSON.parse(raw) as StoredCache;
    if (cached.userId !== userId || Date.now() - cached.savedAt > maxAgeMs) {
      target.removeItem(cacheKey);
      return;
    }
    hydrate(queryClient, cached.state);
    // Persisted data makes navigation and reloads feel immediate, but it must
    // never suppress a fresh read from the database. A mutation can complete
    // immediately before a reload, before the debounced cache writer has saved
    // the updated workspace. Keep the hydrated data visible while marking it
    // stale so active screens revalidate in the background.
    void queryClient.invalidateQueries({
      predicate: (query) => persistedWorkspaceKeys.has(String(query.queryKey[0])),
      refetchType: "none",
    });
  } catch {
    target.removeItem(cacheKey);
  }
}

export function persistRunwayQueryCache(queryClient: QueryClient, userId: string): void {
  const target = storage();
  if (!target) return;
  try {
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => query.state.status === "success" && persistedWorkspaceKeys.has(String(query.queryKey[0])),
    });
    target.setItem(cacheKey, JSON.stringify({ userId, savedAt: Date.now(), state } satisfies StoredCache));
  } catch {
    // A storage quota or privacy-mode restriction must never block the live app.
  }
}

export function clearRunwayQueryCache(): void {
  try { storage()?.removeItem(cacheKey); } catch { /* Storage may be unavailable. */ }
}
