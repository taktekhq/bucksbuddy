import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { RateEditor } from "@/components/RateEditor";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("lbp_per_usd, email")
    .eq("id", user.id)
    .single();

  const rate = profile?.lbp_per_usd ?? DEFAULT_LBP_PER_USD;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      <header className="flex items-center justify-between py-2">
        <Link href="/" className="press text-base text-carrot">
          Done
        </Link>
        <h1 className="text-base font-semibold">Settings</h1>
        <span className="w-12" />
      </header>

      <p className="px-1 text-sm text-label-secondary">
        {profile?.email ?? user.email}
      </p>

      <RateEditor initialRate={rate} />

      <a
        href="/export"
        className="press rounded-card bg-grouped py-4 text-center text-lg font-medium text-label"
      >
        Export CSV
      </a>

      <SignOutButton />
    </main>
  );
}
