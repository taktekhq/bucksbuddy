import { ChevronLeft, ChevronRight } from "lucide-react";

// Pages a month-scoped view between months: a left chevron that walks back as
// far as there's data, a centered month label, and a right chevron that returns
// toward the present and stops there. Shared by Stats (the observatory) and
// History (the rabbit hole) — both dark, so the white/carrot styling fits as-is.
export function MonthSwitcher({
  label,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-card bg-white/10 px-2 py-1.5">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous month"
        className="press -m-1 p-2 text-carrot transition disabled:opacity-25"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <span className="font-display text-sm font-bold uppercase tracking-wide text-white/90">
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next month"
        className="press -m-1 p-2 text-carrot transition disabled:opacity-25"
      >
        <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
