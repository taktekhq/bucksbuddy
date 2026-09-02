// Supabase's implicit-flow redirects (the Google OAuth callback and
// password-recovery email links) carry tokens in the URL fragment —
// "...#access_token=...&refresh_token=...&type=recovery" — the same shape
// the web app parses out of window.location.hash (see src/lib/useSession.ts).
// `expo-linking`'s parse() only reads the query string, not the fragment, so
// this mirrors the web parser directly against the raw redirect URL string.
export type AuthFragment = {
  accessToken: string;
  refreshToken: string;
  type: string | null;
};

export function parseAuthFragment(url: string): AuthFragment | null {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, type: params.get("type") };
}
