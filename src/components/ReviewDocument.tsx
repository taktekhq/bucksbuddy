import {
  Circle,
  CircleCheck,
  Eye,
  Quote,
  Repeat2,
  type LucideIcon,
} from "lucide-react";
import { CHART_RAMP, CHART_REST } from "@/lib/reviewChart";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type {
  ReviewFigure,
  ReviewFinding,
  ReviewFindingKind,
  ReviewFindings,
  ReviewProse,
  SpendingReview,
} from "@/types/db";

// A finished review, rendered field by field in the review screen's own calm
// blue palette (see tailwind.config.ts and docs/DESIGN_SYSTEM.md) — cards get a
// hairline rather than a shadow, which is invisible on a dark ground.
//
// The model returns structured JSON, never markup, so there is no markdown to
// parse and nothing to sanitise — every string lands in a text node. Amounts
// arrive already formatted by the device that computed them (lib/reportDigest),
// which is why figures print verbatim rather than going through lib/money again.
//
// TWO shapes render here. A review written now is a short list of an auditor's
// findings, because that is the only part of this a model is actually good at:
// the numbers are the device's, and they are charted above this by
// ReviewBreakdown. A review bought before that redesign is prose, and still
// opens as it was written — a paid document does not get rewritten under its
// reader.
export function ReviewDocument({
  review,
  subtitle,
}: {
  review: SpendingReview;
  subtitle: string;
}) {
  return review.version === 2 ? (
    <Findings review={review} subtitle={subtitle} />
  ) : (
    <Prose review={review} subtitle={subtitle} />
  );
}

// How each kind of finding is marked. The icon and its colour carry the sort, so
// the three never need headings between them — the list stays one thread of
// notes rather than three stacked sections.
//
// The colours come from the room's own chart ramp (lib/reviewChart), NOT from
// green and red. Green and red mean money in and money out everywhere else in
// this app (docs/DESIGN_SYSTEM.md), and a green tick beside a sentence about
// spending would read as a credit. The icons differ in shape as well, and each
// row states its kind for a screen reader, so colour is never the only signal.
const KINDS: Record<
  ReviewFindingKind,
  { icon: LucideIcon; color: string; label: string }
> = {
  good: { icon: CircleCheck, color: CHART_RAMP[1], label: "Working" },
  improve: { icon: Eye, color: CHART_RAMP[4], label: "Worth a look" },
  swap: { icon: Repeat2, color: CHART_RAMP[2], label: "Could cost less" },
};

// A kind this build has never met — a newer function wrote the review, and the
// installed app is a version behind. It still renders, unmarked rather than
// mislabelled. See asSpendingReview for why this is not an error.
const UNKNOWN_KIND = {
  icon: Circle,
  color: CHART_REST,
  label: "Finding",
} as const;

function markFor(kind: string) {
  return KINDS[kind as ReviewFindingKind] ?? UNKNOWN_KIND;
}

// Working first, then what to hold down, then what might cost less — the order
// an auditor's letter goes in, and the order the model is asked to rank within.
// A kind from a newer server sorts last rather than being dropped.
const KIND_ORDER: string[] = ["good", "improve", "swap"];

/** The chip under the headline: which way this reader's own record is going. */
const STANDINGS: Record<string, string> = {
  improving: "Improving",
  steady: "Steady",
  slipping: "Slipping",
  unclear: "Not enough to say",
};

function Findings({
  review,
  subtitle,
}: {
  review: ReviewFindings;
  subtitle: string;
}) {
  const rank = (kind: string) => {
    const i = KIND_ORDER.indexOf(kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  const sorted = [...review.findings].sort(
    (a, b) => rank(a.kind) - rank(b.kind),
  );

  return (
    <article className="flex flex-col gap-3">
      <SectionHeader className="text-review-muted">The auditor</SectionHeader>
      <div className="flex flex-col gap-2 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
        <p className="text-[11px] font-medium uppercase tracking-wide text-review-muted">
          {subtitle}
        </p>
        <p className="text-lg font-semibold leading-snug text-review-text">
          {review.headline}
        </p>
        <span className="w-fit rounded-pill bg-review-tile px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-review-muted">
          {/* An unrecognised verdict prints as itself rather than as nothing:
              it came from a newer server, and it is still the verdict. */}
          {STANDINGS[review.standing] ?? review.standing}
        </span>
      </div>

      {sorted.map((finding, i) => (
        <FindingCard key={`${i}-${finding.title.slice(0, 16)}`} finding={finding} />
      ))}

      {review.blindSpots.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-card bg-review-card/60 px-4 py-3 ring-1 ring-inset ring-white/5">
          {review.blindSpots.map((spot, i) => (
            <li
              key={`${i}-${spot.slice(0, 12)}`}
              className="text-xs leading-relaxed text-review-muted"
            >
              {spot}
            </li>
          ))}
        </ul>
      )}

      <p className="px-2 text-center text-xs text-review-muted">
        Reads what you logged. Not financial advice.
      </p>
    </article>
  );
}

function FindingCard({ finding }: { finding: ReviewFinding }) {
  const { icon: Icon, color, label } = markFor(finding.kind);
  return (
    <div className="flex gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        // Hex + "26" alpha ≈ 15% tint of the kind's colour, as StatBars does.
        style={{ backgroundColor: `${color}26`, color }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="sr-only">{label}:</span>
        <h4 className="text-[15px] font-semibold leading-snug text-review-text">
          {finding.title}
        </h4>
        <p className="text-[14px] leading-relaxed text-review-muted">
          {finding.detail}
        </p>
        {finding.evidence.length > 0 && (
          <EvidencePills figures={finding.evidence} />
        )}
      </div>
    </div>
  );
}

// The figures ride inline as small pills rather than as a tile grid: a finding
// is one thought, and a row of big tiles under it reads as a second section.
// These are the only strings in a review allowed to contain a digit, and each
// one was checked against the digest character-for-character before it got here.
function EvidencePills({ figures }: { figures: ReviewFigure[] }) {
  return (
    <dl className="mt-0.5 flex flex-wrap gap-1.5">
      {figures.map((figure, i) => (
        <div
          key={`${i}-${figure.label}`}
          className="flex items-baseline gap-1.5 rounded-pill bg-review-tile px-2.5 py-1"
        >
          <dt className="text-[11px] text-review-muted">{figure.label}</dt>
          <dd className="font-numeric text-[13px] font-bold tabular-nums text-review-text">
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// --- the superseded shape, kept readable ---
function Prose({ review, subtitle }: { review: ReviewProse; subtitle: string }) {
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionHeader className="text-review-muted">Your review</SectionHeader>
        <div className="flex flex-col gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
          <p className="text-[13px] font-medium uppercase tracking-wide text-review-muted">
            {subtitle}
          </p>
          <h3 className="text-2xl font-semibold leading-tight text-review-text">
            {review.title}
          </h3>
          <p className="text-base leading-relaxed text-review-text">{review.summary}</p>
        </div>
      </div>

      {review.sections.map((section, i) => (
        <div
          key={`${i}-${section.heading}`}
          className="flex flex-col gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10"
        >
          <h4 className="text-base font-semibold text-review-text">{section.heading}</h4>
          {section.body.split("\n").map((paragraph, p) =>
            paragraph.trim() === "" ? null : (
              <p key={p} className="text-[15px] leading-relaxed text-review-text">
                {paragraph}
              </p>
            ),
          )}
          {section.figures.length > 0 && (
            <dl className="flex flex-wrap gap-2">
              {section.figures.map((figure, f) => (
                <div
                  key={`${f}-${figure.label}`}
                  className="flex min-w-[7rem] flex-1 flex-col gap-0.5 rounded-card bg-review-tile px-3 py-2"
                >
                  <dt className="text-xs text-review-muted">{figure.label}</dt>
                  <dd className="font-numeric text-lg font-bold tabular-nums text-review-text">
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
          <SectionHeader className="text-review-muted">Worth noticing</SectionHeader>
          <ul className="flex flex-col gap-1.5">
            {review.notables.map((note, i) => (
              <li
                key={`${i}-${note.slice(0, 12)}`}
                className="flex items-start gap-3 rounded-card bg-review-card px-4 py-3 ring-1 ring-inset ring-white/10"
              >
                <Quote
                  className="mt-0.5 h-4 w-4 shrink-0 text-carrot"
                  strokeWidth={2.5}
                  aria-hidden
                />
                <span className="text-[15px] leading-relaxed text-review-text">{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.caveats.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader className="text-review-muted">
            What this review couldn&apos;t see
          </SectionHeader>
          <ul className="flex flex-col gap-2 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
            {review.caveats.map((caveat, i) => (
              <li
                key={`${i}-${caveat.slice(0, 12)}`}
                className="text-sm leading-relaxed text-review-muted"
              >
                {caveat}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="px-2 text-center text-xs text-review-muted">
        Reads what you logged. Not financial advice.
      </p>
    </article>
  );
}
