import { Quote } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { SpendingReview } from "@/types/db";

// A finished spending review, rendered field by field.
//
// The model returns structured JSON, never markup, so there is no markdown to
// parse and nothing to sanitise — every string lands in a text node. Amounts
// arrive already formatted by the device that computed them (lib/reportDigest),
// which is why figures print verbatim rather than going through lib/money again.
export function ReviewDocument({
  review,
  subtitle,
}: {
  review: SpendingReview;
  subtitle: string;
}) {
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionHeader>Your review</SectionHeader>
        <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
          <p className="text-[13px] font-medium uppercase tracking-wide text-label-secondary">
            {subtitle}
          </p>
          <h3 className="text-2xl font-semibold leading-tight text-label">
            {review.title}
          </h3>
          <p className="text-base leading-relaxed text-label">{review.summary}</p>
        </div>
      </div>

      {review.sections.map((section, i) => (
        <div
          key={`${i}-${section.heading}`}
          className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card"
        >
          <h4 className="text-base font-semibold text-label">{section.heading}</h4>
          {section.body.split("\n").map((paragraph, p) =>
            paragraph.trim() === "" ? null : (
              <p key={p} className="text-[15px] leading-relaxed text-label">
                {paragraph}
              </p>
            ),
          )}
          {section.figures.length > 0 && (
            <dl className="flex flex-wrap gap-2">
              {section.figures.map((figure, f) => (
                <div
                  key={`${f}-${figure.label}`}
                  className="flex min-w-[7rem] flex-1 flex-col gap-0.5 rounded-card bg-grouped px-3 py-2"
                >
                  <dt className="text-xs text-label-secondary">{figure.label}</dt>
                  <dd className="font-numeric text-lg font-bold tabular-nums text-label">
                    {figure.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}

      {review.notables.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader>Worth noticing</SectionHeader>
          <ul className="flex flex-col gap-1.5">
            {review.notables.map((note, i) => (
              <li
                key={`${i}-${note.slice(0, 12)}`}
                className="flex items-start gap-3 rounded-card bg-surface px-4 py-3 shadow-card"
              >
                <Quote
                  className="mt-0.5 h-4 w-4 shrink-0 text-carrot"
                  strokeWidth={2.5}
                  aria-hidden
                />
                <span className="text-[15px] leading-relaxed text-label">{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.caveats.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader>What this review couldn&apos;t see</SectionHeader>
          <ul className="flex flex-col gap-2 rounded-card bg-surface p-4 shadow-card">
            {review.caveats.map((caveat, i) => (
              <li
                key={`${i}-${caveat.slice(0, 12)}`}
                className="text-sm leading-relaxed text-label-secondary"
              >
                {caveat}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="px-2 text-center text-xs leading-relaxed text-label-secondary">
        A review reads the entries you logged and describes what already happened.
        It isn&apos;t financial advice.
      </p>
    </article>
  );
}
