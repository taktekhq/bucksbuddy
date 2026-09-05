// Ported from the web's src/lib/supabase.test.ts. Expo inlines EXPO_PUBLIC_*
// into process.env instead of import.meta.env, so the env is stubbed there;
// the native client also takes AsyncStorage as its session store and turns
// detectSessionInUrl off (there's no page URL to read a code out of).
// The polyfill is imported purely for its side effect; nothing to exercise.
jest.mock("react-native-url-polyfill/auto", () => ({}));

const mockCreateClient = jest.fn(() => ({ mock: "client" }));
jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const URL_VAR = "EXPO_PUBLIC_SUPABASE_URL";
const KEY_VAR = "EXPO_PUBLIC_SUPABASE_ANON_KEY";

describe("supabase client", () => {
  const original = { url: process.env[URL_VAR], key: process.env[KEY_VAR] };
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    mockCreateClient.mockClear();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (original.url === undefined) delete process.env[URL_VAR];
    else process.env[URL_VAR] = original.url;
    if (original.key === undefined) delete process.env[KEY_VAR];
    else process.env[KEY_VAR] = original.key;
  });

  it("builds the client with PKCE auth options when env vars are present", () => {
    process.env[URL_VAR] = "https://example.supabase.co";
    process.env[KEY_VAR] = "anon-key";

    // Pulled from the same (just-reset) registry as the module under test, so
    // it's the very object the client is handed.
    const asyncStorage =
      require("@react-native-async-storage/async-storage").default;
    const mod = jest.requireActual("@/lib/supabase") as { supabase: unknown };

    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          storage: asyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        }),
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mod.supabase).toEqual({ mock: "client" });
  });

  it("logs an error and uses empty strings when the url is missing", () => {
    delete process.env[URL_VAR];
    process.env[KEY_VAR] = "anon-key";

    jest.requireActual("@/lib/supabase");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith("", "anon-key", expect.any(Object));
  });

  it("logs an error when the anon key is missing", () => {
    process.env[URL_VAR] = "https://example.supabase.co";
    delete process.env[KEY_VAR];

    jest.requireActual("@/lib/supabase");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "",
      expect.any(Object),
    );
  });
});
