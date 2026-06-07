import { ChevronLeft, Mail } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";

// The public contact page — deliberately tiny, like Legal. BucksBuddy is a
// personal money journal for a small circle, so "support" is just an email.
// Reached via the bare "/contact" path, which vercel.json redirects to
// "/#/contact".
const CONTACT_EMAIL = "nizar@taktek.io";

export function Contact() {
  // Back returns to the landing (the signed-out home).
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Plain iOS nav: back chevron + centered title — matches Settings/Legal. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <SectionHeader>Contact</SectionHeader>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-4 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
          <p>
            Questions, bugs, or feedback? Drop us a line and we&apos;ll get back
            to you.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="press flex items-center justify-center gap-2 rounded-pill bg-carrot py-3.5 text-base font-semibold text-white"
          >
            <Mail className="h-5 w-5" strokeWidth={2} />
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>
    </main>
  );
}
