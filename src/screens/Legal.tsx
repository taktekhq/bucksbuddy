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
            BucksBuddy uses &ldquo;Sign in with Google&rdquo; as the only way to
            create and access your account. When you sign in, Google shares a
            limited set of profile information with us, based on the standard{" "}
            <span className="whitespace-nowrap">openid</span>, email, and profile
            scopes:
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              Your Google account&apos;s unique identifier (the OpenID{" "}
              <code className="text-[13px]">sub</code> claim).
            </li>
            <li>Your email address (and whether Google has verified it).</li>
            <li>Your name.</li>
            <li>Your Google profile picture, if you have one.</li>
          </ul>
          <p>
            We do not request access to any other Google data — no Gmail, Drive,
            Contacts, Calendar, or any other Google service or API.
          </p>

          <p className="pt-2 font-semibold text-label">
            How we use Google user data
          </p>
          <p>We use this information only to:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              Create and secure your BucksBuddy account and sign you in on each
              visit.
            </li>
            <li>
              Identify you within the app — for example, showing your name,
              email, or picture in Settings so you know which account you&apos;re
              using.
            </li>
            <li>
              Contact you about your account or support requests, using the
              email address from Google.
            </li>
          </ul>
          <p>
            We never use your Google user data for advertising, profiling, or any
            purpose unrelated to running BucksBuddy.
          </p>

          <p className="pt-2 font-semibold text-label">
            How we store and protect it
          </p>
          <p>
            Your account details and money entries are stored in our database,
            hosted on our behalf by Supabase, our infrastructure provider, who
            processes the data only to provide that hosting. Access is restricted
            to your own account, and data is encrypted in transit. If you turn on
            end-to-end encryption, your amounts and notes are encrypted on your
            device with a passphrase only you hold, so not even we can read them.
          </p>

          <p className="pt-2 font-semibold text-label">
            How we share it
          </p>
          <p>
            We do not sell, rent, or share your Google user data with third
            parties, and we do not transfer it to others except as needed to run
            BucksBuddy (our hosting provider above) or where required by law.
            BucksBuddy&apos;s use and transfer of information received from Google
            APIs adheres to the{" "}
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

          <p className="pt-2 font-semibold text-label">
            Retention and deletion
          </p>
          <p>
            We keep your data only while your account is active. You can delete
            your account at any time from Settings, which permanently removes your
            profile, all entries, and the Google account details we stored. You
            can also revoke BucksBuddy&apos;s access to your Google account at any
            time from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-carrot underline"
            >
              Google Account permissions
            </a>{" "}
            page.
          </p>

          <p className="pt-2">
            Questions about your data? Email us at{" "}
            <a
              href="mailto:nizar@taktek.io"
              className="text-carrot underline"
            >
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

      <p className="px-2 text-xs text-label-secondary">Last updated June 2026.</p>
    </main>
  );
}
