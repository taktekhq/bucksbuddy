import { ArrowDownLeft, ArrowUpRight, Vault } from "lucide-react";
import { Carrot } from "@/components/ui/Carrot";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";

// The public marketing landing page. Succinct and on-brand: the static carrot
// mascot, the Grobold wordmark, a one-line pitch in the "What's up, Doc?" voice,
// three quick feature cards, and a big primary call-to-action.
//
// The CTA doesn't sign in here — it redirects to the Login screen (route "/"),
// which owns the actual Google OAuth flow. Lives behind "/home" for now.

// Three quick selling points, each its own white card. Icons borrow the money
// palette (green in / red out) and the carrot accent, per the design system.
const FEATURES = [
  {
    icon: ArrowUpRight,
    title: "Money in, green",
    body: "Log income in a tap with the native keypad — no fuss, no friction.",
    iconClass: "text-income",
    tintClass: "bg-income/10",
  },
  {
    icon: ArrowDownLeft,
    title: "Money out, red",
    body: "See exactly where every buck went, the moment it leaves your pocket.",
    iconClass: "text-expense",
    tintClass: "bg-expense/10",
  },
  {
    icon: Vault,
    title: "Stash it in the safe",
    body: "Tuck savings — cash or gold — into your private, encrypted safe.",
    iconClass: "text-carrot-dark",
    tintClass: "bg-carrot-soft",
  },
];

export function Landing() {
  useThemeColor("#F2F2F7");

  // Hand off to the Login screen, which renders when there's no session.
  function goToLogin() {
    navigate("/");
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1.25rem+var(--safe-top))]">
      {/* Slim top bar: wordmark left, a quiet Log in link right. */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Carrot className="text-2xl" />
          <span className="font-display text-base font-bold uppercase leading-none text-label-muted">
            Bucks Buddy
          </span>
        </div>
        <button
          type="button"
          onClick={goToLogin}
          className="press text-base font-semibold text-carrot"
        >
          Log in
        </button>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center pt-10 text-center">
        <Carrot className="text-7xl" />
        <h1 className="mt-5 font-display text-5xl font-bold uppercase leading-[0.95] text-label-muted">
          Bucks
          <br />
          Buddy
        </h1>
        <p className="mt-5 text-xl font-semibold text-label">
          The friendly way to watch your money.
        </p>
        <p className="mt-2 text-base leading-relaxed text-label-secondary">
          What&apos;s up, Doc? Track every buck — in green, out red — and stash
          the rest in your safe.
        </p>
      </section>

      {/* Feature cards */}
      <section className="mt-10 flex flex-col gap-2.5">
        {FEATURES.map(({ icon: Icon, title, body, iconClass, tintClass }) => (
          <div
            key={title}
            className="flex items-center gap-3.5 rounded-card bg-surface p-4 shadow-card"
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tintClass}`}
            >
              <Icon className={`h-5 w-5 ${iconClass}`} strokeWidth={2} />
            </div>
            <div>
              <p className="text-base font-semibold text-label">{title}</p>
              <p className="text-sm leading-snug text-label-secondary">{body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Primary call-to-action */}
      <section className="mt-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={goToLogin}
          className="press flex w-full items-center justify-center gap-3 rounded-pill bg-carrot py-4 text-lg font-semibold text-white shadow-carrot"
        >
          {/* The colorful Google "G" sits on a white chip so it reads correctly
              against the carrot pill. */}
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
            <GoogleIcon className="h-4 w-4" />
          </span>
          Continue with Google
        </button>
        <p className="text-sm text-label-secondary">
          Free. No ads. That&apos;s all, folks. 🥕
        </p>
      </section>
    </main>
  );
}
