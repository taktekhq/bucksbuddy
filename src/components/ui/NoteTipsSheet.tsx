import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { CalendarClock, Globe, Repeat, Square, StickyNote, Users, type LucideIcon } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

// The cheat codes a note understands (see lib/notes and lib/recurring): a
// bottom sheet opened from the tiny info button next to the note field, so
// the tricks are one tap away without cluttering the form. Drag down or tap
// the backdrop to dismiss, same as the category sheet.
const TIPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: StickyNote,
    title: "Same note, same payment",
    body: "Write the same note each time (or tap one of the chips) and the Recurring page will spot what keeps coming back. A typo, a different word order or an extra word is fine; a note that shares only one word with another is a different thing.",
  },
  {
    icon: Repeat,
    title: "“subscription” or “membership”",
    body: "Put either word in the note and it's tracked as recurring from the very first entry. The dates decide how often; monthly is assumed until they can. The word is dropped from the name, so “Claude subscription” and a later “Claude” are the same thing.",
  },
  {
    icon: CalendarClock,
    title: "“(yearly)”, “(monthly)”, “(weekly)”",
    body: "Say how often it repeats and that's taken at your word, from the first entry. “every 2 weeks” and “annual” work too.",
  },
  {
    icon: Globe,
    title: "A domain name",
    body: "\u201Csillyguy.com\u201D or the word \u201Cdomain\u201D counts as a yearly renewal from the first entry.",
  },
  {
    icon: Square,
    title: "\u201C(ended)\u201D",
    body: "Put it on the last payment of something you cancelled and it drops off the Recurring page right away. \u201Ccancelled\u201D and \u201Cstopped\u201D work too.",
  },
  {
    icon: Users,
    title: "“with” someone",
    body: "Whatever follows “with” is left out when notes are compared. “Dinner with Sara” and “Lunch with Sara” stay separate; “Netflix with Ali” is still Netflix.",
  },
];

export function NoteTipsSheet({ open, onClose }: Props) {
  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Note tips"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md touch-none rounded-t-[28px] bg-surface px-5 pb-[calc(1.5rem+var(--safe-bottom))] pt-2 shadow-card"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
          >
            {/* Grabber. */}
            <div className="mx-auto mb-4 h-1.5 w-10 cursor-grab rounded-full bg-grouped" />

            <h2 className="text-base font-semibold text-label">Notes that do more</h2>
            <p className="mt-1 text-sm text-label-secondary">
              A few words in a note teach the app what to keep track of.
            </p>

            <ul className="mt-4 flex flex-col gap-4">
              {TIPS.map((tip) => (
                <li key={tip.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-carrot">
                    <tip.icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-label">{tip.title}</p>
                    <p className="mt-0.5 text-sm text-label-secondary">{tip.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-label-secondary">
              A price change keeps a series going; the Recurring page shows the new
              price with the old one underneath. A payment that isn&apos;t logged for
              a whole period past its due date drops off the page, and comes back once
              it&apos;s logged again.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="press mt-5 w-full rounded-pill bg-carrot py-3 text-base font-semibold text-white"
            >
              Got it
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
