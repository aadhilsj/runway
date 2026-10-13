import { Navigate, useLocation } from "react-router";
import { useAuth } from "~/auth/auth-context";
import { AppShell } from "~/components/app-shell";

export default function ProtectedLayout() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="auth-state" aria-live="polite"><p>Restoring your secure session…</p></main>;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

export function ErrorBoundary() {
  return <main className="route-error" role="alert"><h1>We couldn’t open this workspace</h1><p>No data was changed. Return to the overview and try again.</p><a href="/overview">Return to overview</a></main>;
}
