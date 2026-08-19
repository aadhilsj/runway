import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("sign-in", "routes/sign-in.tsx"),
  layout("routes/protected-layout.tsx", [
    index("routes/home-redirect.tsx"),
    route("overview", "routes/overview.tsx"),
    route("forecast", "routes/forecast.tsx"),
    route("money", "routes/money-redirect.tsx"),
    route("money/transactions", "routes/money-transactions.tsx"),
    route("money/accounts", "routes/money-accounts.tsx"),
    route("money/cash-flow", "routes/money-cash-flow.tsx"),
    route("money/budgets", "routes/money-budgets.tsx"),
    route("funds", "routes/funds.tsx"),
    route("funds/payday", "routes/funds-payday.tsx"),
    route("funds/:fundId", "routes/fund-detail.tsx"),
    route("investments", "routes/investments.tsx"),
    route("plans", "routes/plans.tsx"),
    route("settings", "routes/settings.tsx"),
    route("settings/recurring", "routes/settings-recurring.tsx"),
  ]),
] satisfies RouteConfig;
