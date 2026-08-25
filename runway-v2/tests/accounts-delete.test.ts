import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUserId: vi.fn(),
  requireSupabase: vi.fn(),
}));

vi.mock("~/data/repositories/shared", () => ({
  requireAuthenticatedUserId: mocks.requireAuthenticatedUserId,
  requireSupabase: mocks.requireSupabase,
  rpcNullable: (value: unknown) => value,
}));

import { accountsRepository } from "~/data/repositories/accounts-repository";

function deletionResult(result: { data: unknown; error: unknown }) {
  const builder = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  return builder;
}

describe("account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUserId.mockResolvedValue("user-a");
  });

  it("hard-deletes only an owned, non-system account", async () => {
    const builder = deletionResult({ data: { id: "account-a" }, error: null });
    mocks.requireSupabase.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    await accountsRepository.deleteAccount("account-a");

    expect(builder.delete).toHaveBeenCalledOnce();
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", "account-a");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "user_id", "user-a");
    expect(builder.eq).toHaveBeenNthCalledWith(3, "is_system", false);
  });

  it("turns a restricted foreign-key delete into a clear explanation", async () => {
    const builder = deletionResult({ data: null, error: { code: "23503" } });
    mocks.requireSupabase.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    await expect(accountsRepository.deleteAccount("account-a")).rejects.toThrow(
      "This account has financial history and cannot be deleted.",
    );
  });
});
