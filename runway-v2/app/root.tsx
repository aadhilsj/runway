import { QueryClientProvider } from "@tanstack/react-query";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "~/auth/auth-context";
import { LegacyCacheRetirement } from "~/components/legacy-cache-retirement";
import { createRunwayQueryClient } from "~/data/query-client";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "~/styles/global.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f6efe3" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [queryClient] = useState(createRunwayQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <LegacyCacheRetirement />
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong";
  return (
    <main className="route-error" role="alert">
      <p className="eyebrow">Runway</p>
      <h1>{title}</h1>
      <p>
        The page could not be shown. Your financial data has not been changed.
      </p>
      <a href="/overview">Return to overview</a>
    </main>
  );
}
