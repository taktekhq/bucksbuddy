import { ChevronLeft } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";

// The public legal page. BucksBuddy is a personal money journal for a small
// circle, so this says the true things plainly rather than burying them in
// boilerplate. The Privacy section is intentionally specific about Google user
// data — Google's API verification requires the policy to spell out exactly
// what Google data we access and how we use it. Privacy and Terms share one
// page, each its own section. Reached from the landing's "Privacy and Terms"
// button.
export function Legal() {
  // Back returns to the landing (the signed-out home).
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Plain iOS nav: back chevron + centered title — matches Settings. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
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
            <li>
              We count how the app is used, never what you spend.
            </li>
            <li>No ads, and we don&apos;t sell your data.</li>
            <li>
              Turn on end-to-end encryption and not even we can read your
              numbers.
            </li>
            <li>Delete your account anytime to wipe your data.</li>
          </ul>

          <p className="pt-2 font-semibold text-label">
            Google user data we access
          </p>
          <p>
            Almost everyone signs in with Google; a small number of accounts we
            create by hand use an email address and a password instead. Using the
            standard openid, email, and profile scopes, we receive your Google
            account ID (OpenID), email address, name, and profile picture. We do
            not request access to any other Google data or API (no Gmail, Drive,
            Contacts, or Calendar).
          </p>

          <p className="pt-2 font-semibold text-label">
            How we use Google user data
          </p>
          <p>
            We use it only to create and secure your account, sign you in,
            identify you in the app, and email you about your account or support.
            We never use it for advertising or profiling. Your data is stored by
            our hosting provider (Supabase), encrypted in transit, and never
            sold, rented, or shared with third parties except as needed to run
            BucksBuddy or where required by law. BucksBuddy&apos;s use and
            transfer of Google user data adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-carrot underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p className="pt-2 font-semibold text-label">Analytics</p>
          <p>
            We count how the app gets used: signing in, adding, editing or
            deleting an entry, exporting a CSV or PDF, turning encryption on or
            off, and adding the app to your Home Screen. If the app crashes, we
            also receive a report of what broke, so we can fix it. Those counts
            carry your account ID so that one person using BucksBuddy ten times
            isn&apos;t counted as ten people. We use PostHog for this. It never
            receives your amounts, notes, categories or email address, and we
            never use any of it for advertising or profiling.
          </p>

          <p className="pt-2 font-semibold text-label">On your device</p>
          <p>
            The app keeps a copy of your entries in your browser so it opens
            instantly, and, once you turn on end-to-end encryption, your
            passphrase too so you aren&apos;t asked for it every time. Both are
            erased when you sign out or delete your account.
          </p>

          <p>
            Delete your account anytime from Settings to permanently wipe your
            data, or revoke access from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-carrot underline"
            >
              Google Account permissions
            </a>
            . Questions? Email{" "}
            <a href="mailto:nizar@taktek.io" className="text-carrot underline">
              nizar@taktek.io
            </a>
            .
          </p>
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

      <p className="px-2 text-xs text-label-secondary">Last updated September 2026.</p>
    </main>
  );
}
