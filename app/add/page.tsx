import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddEntryFlow } from "@/components/AddEntryFlow";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("lbp_per_usd")
    .eq("id", user.id)
    .single();

  const lbpPerUsd = profile?.lbp_per_usd ?? DEFAULT_LBP_PER_USD;

  return (
    <main className="mx-auto max-w-md">
      <AddEntryFlow lbpPerUsd={lbpPerUsd} />
    </main>
  );
}
