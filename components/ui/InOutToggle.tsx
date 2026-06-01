"use client";

type Props = {
  isIncome: boolean;
  onChange: (isIncome: boolean) => void;
};

// iOS-style segmented control. Out is the common default (left), In on the right.
export function InOutToggle({ isIncome, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-pill bg-grouped p-1">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`press rounded-pill py-2.5 text-base font-semibold ${
          !isIncome ? "bg-white text-expense shadow-card" : "text-label-secondary"
        }`}
      >
        Out
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`press rounded-pill py-2.5 text-base font-semibold ${
          isIncome ? "bg-white text-income shadow-card" : "text-label-secondary"
        }`}
      >
        In
      </button>
    </div>
  );
}
