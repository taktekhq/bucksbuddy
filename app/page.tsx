import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentMonthRange, monthLabel } from "@/lib/dates";
import { netCents } from "@/lib/money";
import { NetTotal } from "@/components/ui/NetTotal";
import { RecentList } from "@/components/RecentList";
import type { Transaction } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from, to } = currentMonthRange();

  const { data: monthRows } = await supabase
    .from("transactions")
    .select("is_income, amount_usd_cents")
    .gte("occurred_at", from.toISOString())
    .lt("occurred_at", to.toISOString());

  const { data: recent } = await supabase
    .from("transactions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(20);

  const net = netCents(monthRows ?? []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[calc(6rem+var(--safe-bottom))] pt-[calc(2rem+var(--safe-top))]">
      <div className="flex justify-end">
        <Link href="/settings" className="press text-2xl" aria-label="Settings">
          ⚙️
        </Link>
      </div>

      <div className="py-8">
        <NetTotal cents={net} monthLabel={monthLabel()} />
      </div>

      <h2 className="mb-2 px-1 text-sm font-semibold text-label-secondary">
        Recent
      </h2>
      <RecentList rows={(recent ?? []) as Transaction[]} />

      {/* Big floating add button — the primary action. Centered via a flex
          wrapper (not a transform) so the .press scale animation stays clean. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+var(--safe-bottom))] flex justify-center">
        <Link
          href="/add"
          prefetch
          className="press pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-label text-4xl font-light text-white shadow-card"
          aria-label="Add entry"
        >
          +
        </Link>
      </div>
    </main>
  );
}
