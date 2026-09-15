import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Repeat, StickyNote, type LucideIcon } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

// The cheat codes a note understands (see lib/notes and lib/recurring): a
// bottom sheet opened from the tiny info button next to the note field, so
// the tricks are one tap away without cluttering the form. Drag down or tap
// the backdrop to dismiss, same as the category sheet.
type Tip = {
  icon: LucideIcon;
  title: string;
  body?: string;
  // Sub-points: what to do, then how — keywords in `backticks` render as code.
  items?: { title: string; body: string }[];
};

const TIPS: Tip[] = [
  {
    icon: StickyNote,
    title: "Same note, same payment",
    body: "Reuse a note and the app spots what repeats.",
  },
  {
    icon: Repeat,
    title: "Recurring keywords",
    items: [
      {
        title: "Start a recurring item",
        body: "Put `subscription` or `membership` in the first entry.",
      },
      {
        title: "Set how often it repeats",
        body: "Add `(yearly)`, `(monthly)` or `(weekly)` to the note.",
      },
      {
        title: "Stop a recurring item",
        body: "Put `(ended)` on its last entry.",
      },
    ],
  },
];

// Render a line with its `keywords` as code: "Put `(ended)` on…" → Put <code>(ended)</code> on…
function withKeywords(text: string) {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-grouped px-1 py-0.5 font-numeric text-[13px] text-label">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

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

            <h2 className="text-base font-semibold text-label">Recurring payments</h2>
            <p className="mt-1 text-sm text-label-secondary">A few words in a note do more.</p>

            <ul className="mt-4 flex flex-col gap-4">
              {TIPS.map((tip) => (
                <li key={tip.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-carrot">
                    <tip.icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-label">{tip.title}</p>
                    {tip.body && (
                      <p className="mt-0.5 text-sm text-label-secondary">{tip.body}</p>
                    )}
                    {tip.items && (
                      <ul className="mt-2 flex flex-col gap-2.5">
                        {tip.items.map((item) => (
                          <li key={item.title}>
                            <p className="text-sm font-medium text-label">{item.title}</p>
                            <p className="mt-0.5 text-sm leading-relaxed text-label-secondary">
                              {withKeywords(item.body)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>

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
