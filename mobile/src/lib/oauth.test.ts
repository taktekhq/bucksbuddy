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
const mockSignInWithIdToken = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => (mockSignInWithOAuth as (...a: unknown[]) => unknown)(...args),
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
      signInWithIdToken: (...args: unknown[]) =>
        (mockSignInWithIdToken as (...a: unknown[]) => unknown)(...args),
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

// Sign in with Apple. Nothing round-trips through a browser here: iOS returns
// an identity token and Supabase exchanges it, so the surface to cover is the
// availability gate and what each failure reports back.
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import { isAppleSignInAvailable, signInWithApple } from "@/lib/oauth";

const asMock = (f: unknown) => f as jest.Mock;

function onPlatform(os: string, run: () => Promise<void>) {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  return run().finally(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });
}

describe("isAppleSignInAvailable", () => {
  it("is false off iOS, without even asking the OS", async () => {
    asMock(AppleAuthentication.isAvailableAsync).mockResolvedValue(true);
    await onPlatform("android", async () => {
      expect(await isAppleSignInAvailable()).toBe(false);
    });
    expect(AppleAuthentication.isAvailableAsync).not.toHaveBeenCalled();
  });

  it("asks the OS on iOS", async () => {
    asMock(AppleAuthentication.isAvailableAsync).mockResolvedValue(true);
    await onPlatform("ios", async () => {
      expect(await isAppleSignInAvailable()).toBe(true);
    });
  });

  it("is false when the OS check itself throws", async () => {
    asMock(AppleAuthentication.isAvailableAsync).mockRejectedValue(new Error("no entitlement"));
    await onPlatform("ios", async () => {
      expect(await isAppleSignInAvailable()).toBe(false);
    });
  });
});

describe("signInWithApple", () => {
  it("exchanges Apple's identity token for a session", async () => {
    asMock(AppleAuthentication.signInAsync).mockResolvedValue({ identityToken: "tok" });
    mockSignInWithIdToken.mockResolvedValue({ error: null });
    expect(await signInWithApple()).toEqual({ error: null });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "tok" });
  });

  it("reports a Supabase failure", async () => {
    asMock(AppleAuthentication.signInAsync).mockResolvedValue({ identityToken: "tok" });
    mockSignInWithIdToken.mockResolvedValue({ error: { message: "bad audience" } });
    expect(await signInWithApple()).toEqual({ error: "bad audience" });
  });

  it("reports a credential with no token rather than calling Supabase", async () => {
    asMock(AppleAuthentication.signInAsync).mockResolvedValue({ identityToken: null });
    expect(await signInWithApple()).toEqual({
      error: "Apple didn't return a sign-in token.",
    });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("treats a cancelled sheet as a non-event, like dismissing the Google browser", async () => {
    asMock(AppleAuthentication.signInAsync).mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    expect(await signInWithApple()).toEqual({ error: null });
  });

  it("reports any other failure", async () => {
    asMock(AppleAuthentication.signInAsync).mockRejectedValue(new Error("boom"));
    expect(await signInWithApple()).toEqual({ error: "Couldn't sign in with Apple." });
  });
});
