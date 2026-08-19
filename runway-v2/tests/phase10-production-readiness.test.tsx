import { readFile } from "node:fs/promises";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LegacyCacheRetirement } from "~/components/legacy-cache-retirement";
import { userFacingError } from "~/user-facing-error";

describe("Phase 10 production readiness", () => {
  it("uses an SPA fallback and immutable hashed assets on Vercel", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8"));
    expect(config.outputDirectory).toBe("build/client");
    expect(config.rewrites).toContainEqual(expect.objectContaining({ destination: "/index.html" }));
    expect(config.headers).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/index.html" }),
      expect.objectContaining({ source: "/assets/(.*)" }),
    ]));
  });

  it("does not expose database implementation errors to the owner", () => {
    expect(userFacingError(new Error('duplicate key violates constraint "transactions_pkey"'), "Could not save.")).toBe("Could not save.");
    expect(userFacingError(new Error("Enter a positive amount."), "Could not save.")).toBe("Enter a positive amount.");
  });

  it("keeps the established passwordless sign-in flow without creating users", async () => {
    const source = await readFile("app/routes/sign-in.tsx", "utf8");
    expect(source).toContain("signInWithOtp");
    expect(source).toContain("verifyOtp");
    expect(source).toContain("shouldCreateUser: false");
    expect(source).not.toContain("signInWithPassword");
  });

  it("retires the legacy service worker and Runway PWA caches", async () => {
    const unregister = vi.fn(async () => true);
    const deleteCache = vi.fn(async () => true);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: vi.fn(async () => [{ unregister }]) } });
    Object.defineProperty(window, "caches", { configurable: true, value: { keys: vi.fn(async () => ["runway-pwa-v9", "unrelated"]), delete: deleteCache } });
    render(<LegacyCacheRetirement />);
    await waitFor(() => expect(unregister).toHaveBeenCalledOnce());
    expect(deleteCache).toHaveBeenCalledWith("runway-pwa-v9");
    expect(deleteCache).not.toHaveBeenCalledWith("unrelated");
  });
});
