import { Navigate } from "react-router";

export default function RecurringSettingsRedirect() {
  return <Navigate to="/forecast/monthly" replace />;
}
