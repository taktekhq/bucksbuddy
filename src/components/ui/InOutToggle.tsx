type Props = {
  isIncome: boolean;
  onChange: (isIncome: boolean) => void;
};

// Segmented control on a plain Apple track. The active side fills with money
// color — red for Out, green for In — so direction reads instantly.
export function InOutToggle({ isIncome, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-pill bg-grouped p-1">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`press rounded-pill py-2.5 text-base font-semibold transition ${
          !isIncome ? "bg-expense text-white shadow-segment" : "text-label-secondary"
        }`}
      >
        Out
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`press rounded-pill py-2.5 text-base font-semibold transition ${
          isIncome ? "bg-income text-white shadow-segment" : "text-label-secondary"
        }`}
      >
        In
      </button>
    </div>
  );
}
