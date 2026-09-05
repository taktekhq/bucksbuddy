// Native Google sign-in. The web has no counterpart: there the page simply
// redirects and Supabase reads the PKCE code back out of the URL. Here the code
// comes back on a deep link and is exchanged by hand, so every step of that
// hand-off is covered: success, dismissal, a missing code, an error_description
// and a failed exchange.
import * as WebBrowser from "expo-web-browser";

jest.mock("expo-linking", () => ({
  createURL: jest.fn((path: string) => `bucksbuddy://${path}`),
  parse: jest.fn(() => ({ queryParams: {} })),
}));

const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => (mockSignInWithOAuth as (...a: unknown[]) => unknown)(...args),
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
    },
  },
}));

import * as Linking from "expo-linking";
import { signInWithGoogle } from "@/lib/oauth";

const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const parse = Linking.parse as jest.Mock;

beforeEach(() => {
  mockSignInWithOAuth.mockResolvedValue({
    data: { url: "https://accounts.google.com/o/oauth2?x=1" },
    error: null,
  });
  openAuthSessionAsync.mockResolvedValue({
    type: "success",
    url: "bucksbuddy:///?code=abc",
  });
  parse.mockReturnValue({ queryParams: { code: "abc" } });
  mockExchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("signInWithGoogle", () => {
  it("completes any pending auth session at import", () => {
    // Required by expo-web-browser so a returning session is dismissed. Loaded
    // in a fresh registry because the harness clears mock calls between tests,
    // which wipes the record of the original import.
    jest.isolateModules(() => {
      const browser = require("expo-web-browser");
      require("@/lib/oauth");
      expect(browser.maybeCompleteAuthSession).toHaveBeenCalledTimes(1);
    });
  });

  it("opens Google in an auth session and exchanges the code", async () => {
    const res = await signInWithGoogle();

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "bucksbuddy:///", skipBrowserRedirect: true },
    });
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2?x=1",
      "bucksbuddy:///",
    );
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res).toEqual({ error: null });
  });

  it("surfaces a failure to start the flow", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "provider disabled" },
    });
    expect(await signInWithGoogle()).toEqual({ error: "provider disabled" });
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it("explains itself when Supabase returns no URL at all", async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    expect(await signInWithGoogle()).toEqual({
      error: "Couldn't start sign-in.",
    });
  });

  it("treats a dismissed browser sheet as a non-error", async () => {
    openAuthSessionAsync.mockResolvedValue({ type: "dismiss" });
    expect(await signInWithGoogle()).toEqual({ error: null });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("passes the provider's error_description through when there's no code", async () => {
    parse.mockReturnValue({
      queryParams: { error_description: "access_denied by user" },
    });
    expect(await signInWithGoogle()).toEqual({
      error: "access_denied by user",
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the redirect carries nothing useful", async () => {
    // No query params at all (`?? {}`), and a non-string error_description.
    parse.mockReturnValueOnce({ queryParams: null });
    expect(await signInWithGoogle()).toEqual({
      error: "Sign-in was interrupted.",
    });

    parse.mockReturnValueOnce({
      queryParams: { code: ["a", "b"], error_description: ["nope"] },
    });
    expect(await signInWithGoogle()).toEqual({
      error: "Sign-in was interrupted.",
    });
  });

  it("surfaces an exchange failure", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid grant" },
    });
    expect(await signInWithGoogle()).toEqual({ error: "invalid grant" });
  });
});
