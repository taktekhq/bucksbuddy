import type { Category } from "@/lib/categories";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

export function CategoryGrid({ categories, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {categories.map((c) => {
        const active = c.id === selected;
        const Icon = c.icon;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`press flex flex-col items-center justify-center gap-1.5 rounded-card py-5 transition ${
              active ? "bg-carrot text-white" : "text-label"
            }`}
            // Inactive tiles get a soft tint of the category's own color so the
            // grid reads colorful, not bland gray. Active selection stays carrot.
            style={active ? undefined : { backgroundColor: `${c.color}1A` }}
          >
            <Icon
              className="h-7 w-7"
              strokeWidth={2}
              style={active ? undefined : { color: c.color }}
            />
            <span className="text-xs font-medium">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
