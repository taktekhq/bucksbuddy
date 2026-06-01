import { supabase } from "@/lib/supabase";

export function SignOutButton() {
  async function signOut() {
    await supabase.auth.signOut();
    // The auth listener in App flips back to the login screen automatically.
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="press w-full rounded-card bg-grouped py-4 text-lg font-medium text-expense"
    >
      Sign out
    </button>
  );
}
