import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { installTarget, isStandalone } from "@/lib/install";
import posthog from "@/lib/posthog";

// Chrome's install event. Not in lib.dom, and iOS never fires it.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Props = {
  /** Wraps the card in a titled section, the way Settings lays things out. */
  header?: string;
  className?: string;
};

// A quiet card telling phone users how to keep BucksBuddy a tap away. iOS has
// no install API, so it gets Safari's steps; Chrome on Android offers a real
// prompt, which we hold on to and fire from an Install button; Chrome without
// one (it decided the site is not installable, or already asked) gets the
// menu route. Renders nothing once the app is on the Home Screen, and nothing
// on a desktop.
export function InstallHint({ header, className = "" }: Props) {
  const target = installTarget();
  const [installed, setInstalled] = useState(isStandalone);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Chrome would otherwise show its own mini-infobar; we offer the button.
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      posthog.capture("pwa_installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !target) return null;

  async function install(event: BeforeInstallPromptEvent) {
    await event.prompt();
    const { outcome } = await event.userChoice;
    posthog.capture("install_prompt_answered", { outcome });
    // Chrome hands out one prompt per page load; either answer spends it.
    setPrompt(null);
  }

  const steps =
    target === "ios"
      ? "In Safari, tap Share, then Add to Home Screen."
      : prompt
        ? "Keep it a tap away. No app store needed."
        : "In Chrome, open the menu, then Add to Home screen.";

  const card = (
    <div className={`flex items-center gap-3.5 rounded-card bg-surface p-4 shadow-card ${className}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-carrot-soft">
        <Smartphone className="h-5 w-5 text-carrot-dark" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-label">Add to Home Screen</p>
        <p className="text-sm leading-snug text-label-secondary">{steps}</p>
      </div>
      {prompt && (
        <button
          type="button"
          onClick={() => install(prompt)}
          className="press shrink-0 rounded-pill bg-carrot px-4 py-2 text-sm font-semibold text-white"
        >
          Install
        </button>
      )}
    </div>
  );

  if (!header) return card;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader>{header}</SectionHeader>
      {card}
    </section>
  );
}
