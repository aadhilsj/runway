import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "~/auth/auth-context";
import { clearRunwayQueryCache, persistRunwayQueryCache, restoreRunwayQueryCache } from "~/data/query-cache";
import { accountsRepository } from "~/data/repositories/accounts-repository";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { balancesRepository } from "~/data/repositories/balances-repository";
import { categoriesRepository } from "~/data/repositories/categories-repository";
import { investmentsRepository } from "~/data/repositories/investments-repository";
import { plansRepository } from "~/data/repositories/plans-repository";
import { transactionsRepository } from "~/data/repositories/transactions-repository";
import { MarkIcon, SyncIcon } from "./icons";

const money = [
  ["Overview", "/overview"],
  ["Forecast", "/forecast"],
  ["Funds", "/funds"],
  ["Activity", "/money/transactions"],
] as const;
const planningAndInvestments = [
  ["Budgets", "/money/budgets"],
  ["Plans", "/plans"],
  ["Investments", "/investments"],
] as const;
const records = [
  ["Accounts", "/money/accounts"],
  ["Analytics", "/analytics"],
] as const;

function NavigationGroup({
  label,
  items,
}: {
  label: string;
  items: readonly (readonly [string, string])[];
}) {
  return (
    <div className="nav-group">
      <p>{label}</p>
      {items.map(([name, href]) => (
        <NavLink key={href} to={href} prefetch="render">
          {name}
        </NavLink>
      ))}
    </div>
  );
}

export function AppShell() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? "";
  useState(() => { if (userId) restoreRunwayQueryCache(queryClient, userId); });
  useEffect(() => {
    if (!userId) return;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persistRunwayQueryCache(queryClient, userId), 100);
    });
    const warm = async () => {
      const analytics = await queryClient.ensureQueryData({ queryKey: ["analytics-workspace"], queryFn: () => analyticsRepository.getWorkspace(), staleTime: 30_000 });
      if (!queryClient.getQueryData(["forecast-workspace"])) queryClient.setQueryData(["forecast-workspace"], analytics.forecast);
      if (!queryClient.getQueryData(["funds-workspace"])) queryClient.setQueryData(["funds-workspace"], analytics.funds);
      if (!queryClient.getQueryData(["budget-workspace"])) queryClient.setQueryData(["budget-workspace"], analytics.budgets);
      if (!queryClient.getQueryData(["payday-workspace"])) queryClient.setQueryData(["payday-workspace"], { funds: analytics.funds, forecast: analytics.forecast });
      await Promise.allSettled([
        queryClient.ensureQueryData({ queryKey: ["plans-workspace"], queryFn: () => plansRepository.getWorkspace(), staleTime: 30_000 }),
        queryClient.ensureQueryData({ queryKey: ["investments-workspace"], queryFn: () => investmentsRepository.getWorkspace(), staleTime: 30_000 }),
        queryClient.ensureQueryData({ queryKey: ["transactions"], queryFn: () => transactionsRepository.listTransactions({ limit: 250 }), staleTime: 30_000 }),
        queryClient.ensureQueryData({ queryKey: ["accounts", "balances"], queryFn: () => accountsRepository.listAccountsWithBalances(), staleTime: 30_000 }),
        queryClient.ensureQueryData({ queryKey: ["net-worth"], queryFn: () => balancesRepository.getCurrentNetWorth("NOK"), staleTime: 30_000 }),
        queryClient.ensureQueryData({ queryKey: ["categories"], queryFn: () => categoriesRepository.listCategories(), staleTime: 30_000 }),
      ]);
      persistRunwayQueryCache(queryClient, userId);
    };
    void warm().catch(() => { /* Individual screens retain their own retry and error handling. */ });
    return () => { unsubscribe(); if (saveTimer) clearTimeout(saveTimer); };
  }, [queryClient, userId]);
  const handleSignOut = async () => { clearRunwayQueryCache(); queryClient.clear(); await signOut(); };
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink to="/overview" prefetch="render" className="brand" aria-label="Runway overview">
          <MarkIcon />
          <span>Runway</span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavigationGroup label="Money" items={money} />
          <NavigationGroup label="Planning & investments" items={planningAndInvestments} />
          <NavigationGroup label="Records & insights" items={records} />
        </nav>
        <NavLink className="settings-link" to="/settings" prefetch="render">
          Settings
        </NavLink>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="location-label">Current view</span>
            <strong>{titleForPath(location.pathname)}</strong>
          </div>
          <div className="profile-area">
            <span className="sync-status">
              <SyncIcon /> Synced
            </span>
            <span className="avatar" aria-hidden="true">
              {session?.user.email?.slice(0, 1).toUpperCase() ?? "R"}
            </span>
            <button
              type="button"
              className="quiet-button"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function titleForPath(path: string): string {
  if (path === "/plans/compare") return "Compare Plans";
  if (path.startsWith("/plans/")) return "Plan detail";
  if (path === "/settings/recurring") return "Recurring rules";
  if (path === "/forecast/monthly") return "Monthly forecast";
  if (path === "/forecast/assumptions") return "Forecast breakdown";
  if (path === "/funds/payday") return "Payday plan";
  if (path.startsWith("/funds/")) return "Fund detail";
  const match = [
    ...money,
    ...planningAndInvestments,
    ...records,
    ["Settings", "/settings"] as const,
  ].find(([, href]) => path === href);
  return match?.[0] ?? "Runway";
}
