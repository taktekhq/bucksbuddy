import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createClient = vi.fn(() => ({ mock: "client" }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("supabase client", () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the client with PKCE auth options when env vars are present", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mod = await import("@/lib/supabase");

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          flowType: "pkce",
          detectSessionInUrl: true,
        }),
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mod.supabase).toEqual({ mock: "client" });
    errorSpy.mockRestore();
  });

  it("falls back to the NEXT_PUBLIC_ env vars when VITE_ ones are unset", async () => {
    // Leave VITE_ vars unset so the `?? NEXT_PUBLIC_` fallback is exercised.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://next.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "next-key");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("@/lib/supabase");

    expect(createClient).toHaveBeenCalledWith(
      "https://next.supabase.co",
      "next-key",
      expect.any(Object),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs an error and uses empty strings when no env vars are set", async () => {
    // No env vars stubbed → url/anonKey are undefined → `?? ""` kicks in.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("@/lib/supabase");

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith("", "", expect.any(Object));
    errorSpy.mockRestore();
  });
});
