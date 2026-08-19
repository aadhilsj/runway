import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "~/auth/auth-context";
import { MarkIcon, SyncIcon } from "./icons";

const primary = [
  ["Overview", "/overview"], ["Forecast", "/forecast"], ["Transactions", "/money/transactions"],
  ["Accounts", "/money/accounts"], ["Cash flow", "/money/cash-flow"], ["Budgets", "/money/budgets"],
] as const;
const planning = [["Funds", "/funds"], ["Investments", "/investments"], ["Plans", "/plans"]] as const;

function NavigationGroup({ label, items }: { label: string; items: readonly (readonly [string, string])[] }) {
  return <div className="nav-group"><p>{label}</p>{items.map(([name, href]) => <NavLink key={href} to={href}>{name}</NavLink>)}</div>;
}

export function AppShell() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink to="/overview" className="brand" aria-label="Runway overview"><MarkIcon /><span>Runway</span></NavLink>
        <nav aria-label="Primary navigation">
          <NavigationGroup label="Today" items={primary.slice(0, 2)} />
          <NavigationGroup label="Money" items={primary.slice(2)} />
          <NavigationGroup label="Planning" items={planning} />
        </nav>
        <NavLink className="settings-link" to="/settings">Settings</NavLink>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div><span className="location-label">Current view</span><strong>{titleForPath(location.pathname)}</strong></div>
          <div className="profile-area">
            <span className="sync-status"><SyncIcon /> Synced</span>
            <span className="avatar" aria-hidden="true">{session?.user.email?.slice(0, 1).toUpperCase() ?? "R"}</span>
            <button type="button" className="quiet-button" onClick={() => void signOut()}>Sign out</button>
          </div>
        </header>
        <main className="content" id="main-content"><Outlet /></main>
      </div>
    </div>
  );
}

function titleForPath(path: string): string {
  if (path === "/settings/recurring") return "Recurring rules";
  const match = [...primary, ...planning, ["Settings", "/settings"] as const].find(([, href]) => path === href);
  return match?.[0] ?? "Runway";
}
