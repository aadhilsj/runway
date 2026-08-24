import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "~/auth/auth-context";
import { requireAuthenticatedUserId } from "~/data/repositories/shared";

const unsubscribe = vi.fn();
const session = { access_token: "test", token_type: "bearer", expires_in: 3600, expires_at: 0, refresh_token: "test", user: { id: "user" } };
const authMocks = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("~/data/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: authMocks.getSession,
      getUser: authMocks.getUser,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      signOut: vi.fn(),
    },
  }),
}));

function Probe() {
  const auth = useAuth();
  return <p>{auth.loading ? "loading" : auth.session ? "restored" : "signed out"}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
  authMocks.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
});

describe("auth session foundation", () => {
  it("restores the persisted Supabase session", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText("loading")).toBeVisible();
    await waitFor(() => expect(screen.getByText("restored")).toBeVisible());
  });

  it("uses the restored session for repository writes without another network user lookup", async () => {
    const userId = await requireAuthenticatedUserId({ auth: { getSession: authMocks.getSession, getUser: authMocks.getUser } } as never);

    expect(userId).toBe("user");
    expect(authMocks.getSession).toHaveBeenCalledOnce();
    expect(authMocks.getUser).not.toHaveBeenCalled();
  });
});
