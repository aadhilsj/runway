import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "~/auth/auth-context";
import { analyticsRepository } from "~/data/repositories/analytics-repository";
import { MarkIcon, SyncIcon } from "./icons";

const primary = [
  ["Overview", "/overview"],
  ["Forecast", "/forecast"],
  ["Funds", "/funds"],
  ["Plans", "/plans"],
  ["Investments", "/investments"],
] as const;
const money = [
  ["Activity", "/money/transactions"],
  ["Accounts", "/money/accounts"],
  ["Budgets", "/money/budgets"],
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
        <NavLink key={href} to={href}>
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
  useEffect(() => {
    if (!session) return;
    void queryClient.prefetchQuery({ queryKey: ["analytics-workspace"], queryFn: () => analyticsRepository.getWorkspace(), staleTime: 30_000 });
  }, [queryClient, session]);
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink to="/overview" className="brand" aria-label="Runway overview">
          <MarkIcon />
          <span>Runway</span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavigationGroup label="Plan your money" items={primary} />
          <NavigationGroup label="Money records" items={money} />
        </nav>
        <NavLink className="settings-link" to="/settings">
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
              onClick={() => void signOut()}
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
  if (path === "/forecast/assumptions") return "Forecast assumptions";
  if (path === "/funds/payday") return "Payday plan";
  if (path.startsWith("/funds/")) return "Fund detail";
  const match = [
    ...primary,
    ...money,
    ["Settings", "/settings"] as const,
  ].find(([, href]) => path === href);
  return match?.[0] ?? "Runway";
}
