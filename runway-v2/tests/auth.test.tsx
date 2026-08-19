import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "~/auth/auth-context";

const unsubscribe = vi.fn();
const session = { access_token: "test", token_type: "bearer", expires_in: 3600, expires_at: 0, refresh_token: "test", user: { id: "user" } };
vi.mock("~/data/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      signOut: vi.fn(),
    },
  }),
}));

function Probe() {
  const auth = useAuth();
  return <p>{auth.loading ? "loading" : auth.session ? "restored" : "signed out"}</p>;
}

describe("auth session foundation", () => {
  it("restores the persisted Supabase session", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("loading")).toBeVisible();
    await waitFor(() => expect(screen.getByText("restored")).toBeVisible());
  });
});
