import type { Category } from "@/lib/categories";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

export function CategoryGrid({ categories, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {categories.map((c) => {
        const active = c.id === selected;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`press flex flex-col items-center justify-center gap-1 rounded-card py-4 ${
              active ? "bg-label text-white" : "bg-grouped text-label"
            }`}
          >
            <span className="text-2xl leading-none">{c.emoji}</span>
            <span className="text-xs font-medium">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
