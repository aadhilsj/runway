import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "~/components/app-shell";

vi.mock("~/auth/auth-context", () => ({
  useAuth: () => ({ session: { user: { email: "person@example.test" } }, signOut: vi.fn() }),
}));
vi.mock("~/data/repositories/analytics-repository", () => ({ analyticsRepository: { getWorkspace: vi.fn(async () => ({})) } }));

afterEach(cleanup);

describe("application shell", () => {
  it("exposes semantic navigation and renders a child route", async () => {
    const router = createMemoryRouter([{
      path: "/", element: <AppShell />, children: [{ path: "overview", element: <h1>Overview content</h1> }],
    }], { initialEntries: ["/overview"] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    const desktopNavigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(desktopNavigation).toBeVisible();
    expect(within(desktopNavigation).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    const mobileNavigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(mobileNavigation).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Cash flow" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Overview content" })).toBeVisible();
  });

  it("opens secondary destinations in the mobile More sheet", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([{
      path: "/", element: <AppShell />, children: [{ path: "overview", element: <h1>Overview content</h1> }],
    }], { initialEntries: ["/overview"] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(sheet).toHaveAttribute("open");
    expect(within(sheet).getByRole("link", { name: /Plans/ })).toHaveAttribute("href", "/plans");
    expect(within(sheet).getByRole("link", { name: /Analytics/ })).toHaveAttribute("href", "/analytics");

    await user.click(within(sheet).getByRole("button", { name: "Close panel" }));
    expect(sheet).not.toHaveAttribute("open");
  });
});
