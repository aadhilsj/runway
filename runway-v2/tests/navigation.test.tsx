import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "~/components/app-shell";

vi.mock("~/auth/auth-context", () => ({
  useAuth: () => ({ session: { user: { email: "person@example.test" } }, signOut: vi.fn() }),
}));
vi.mock("~/data/repositories/analytics-repository", () => ({ analyticsRepository: { getWorkspace: vi.fn(async () => ({})) } }));

describe("application shell", () => {
  it("exposes semantic navigation and renders a child route", async () => {
    const router = createMemoryRouter([{
      path: "/", element: <AppShell />, children: [{ path: "overview", element: <h1>Overview content</h1> }],
    }], { initialEntries: ["/overview"] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Cash flow" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Overview content" })).toBeVisible();
  });
});
