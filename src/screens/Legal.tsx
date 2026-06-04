import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";

// The public legal pages — deliberately tiny. BucksBuddy is a personal money
// journal for a small circle, so these say the few true things plainly rather
// than burying them in boilerplate. Reached from the landing footer.

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Plain iOS nav: back chevron + centered title — matches Settings. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/home")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <SectionHeader>{title}</SectionHeader>
      </header>

      <section className="flex flex-col gap-3 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
        {children}
      </section>

      <p className="px-2 text-xs text-label-secondary">Last updated June 2026.</p>
    </main>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy">
      <p>BucksBuddy keeps it simple:</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>We store your entries only to show them back to you.</li>
        <li>No ads, no trackers, and we never sell your data.</li>
        <li>
          Turn on end-to-end encryption and not even we can read your numbers.
        </li>
        <li>Delete your account anytime to wipe your data.</li>
      </ul>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms">
      <p>The short version:</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>BucksBuddy is a personal money journal, offered as-is.</li>
        <li>Track your own money — nothing illegal.</li>
        <li>You&apos;re responsible for your account and what you put in it.</li>
        <li>We may change or shut down the app.</li>
      </ul>
      <p>That&apos;s all, folks. 🥕</p>
    </LegalPage>
  );
}
