import { ChevronLeft } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";

// The public legal page — deliberately tiny. BucksBuddy is a personal money
// journal for a small circle, so this says the few true things plainly rather
// than burying them in boilerplate. Privacy and Terms share one page, each its
// own section. Reached from the landing's "Privacy and Terms" button.
export function Legal() {
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
        <SectionHeader>Legal</SectionHeader>
      </header>

      <section className="flex flex-col gap-2">
        <SectionHeader>Privacy</SectionHeader>
        <div className="flex flex-col gap-3 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
          <p>BucksBuddy keeps it simple:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>We store your entries only to show them back to you.</li>
            <li>
              To create your account, we only take your name, email, and ID
              (OpenID) from Google.
            </li>
            <li>No ads, and we don&apos;t sell your data.</li>
            <li>
              Turn on end-to-end encryption and not even we can read your
              numbers.
            </li>
            <li>Delete your account anytime to wipe your data.</li>
          </ul>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader>Terms</SectionHeader>
        <div className="flex flex-col gap-3 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
          <p>The short version:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>BucksBuddy is a personal money journal, offered as-is.</li>
            <li>Track your own money — nothing illegal.</li>
            <li>
              You&apos;re responsible for your account and what you put in it.
            </li>
          </ul>
          <p>That&apos;s all, folks. 🥕</p>
        </div>
      </section>

      <p className="px-2 text-xs text-label-secondary">Last updated June 2026.</p>
    </main>
  );
}
