// Feature gating by signed-in email. The savings "Safe" is a proof of concept
// limited to a few accounts until it's ready for everyone. Email is not a secret
// (it's also enforced by RLS at the row level), this just hides the UI.
const SAFE_ALLOWLIST = new Set([
  "nizar.mah99@gmail.com",
  "gracia.hobeich@gmail.com",
  "laylamah01@gmail.com",
]);

/** True if this user is allowed to see and use the savings Safe. */
export function canUseSafe(email: string | null | undefined): boolean {
  return !!email && SAFE_ALLOWLIST.has(email.trim().toLowerCase());
}
