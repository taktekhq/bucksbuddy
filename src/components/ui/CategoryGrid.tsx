import type { Category } from "@/lib/categories";

type Props = {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
};

// 3-col colorful tiles: selected fills with the category color, the rest sit on
// a soft tint of their own color.
export function CategoryGrid({ categories, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {categories.map((c) => {
        const active = c.id === selected;
        const Icon = c.icon;
        const fg = active ? "#FFFFFF" : c.color;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="press flex flex-col items-center justify-center gap-1.5 rounded-card py-5"
            style={{ backgroundColor: active ? c.color : `${c.color}1A` }}
          >
            <Icon className="h-7 w-7" strokeWidth={2} style={{ color: fg }} />
            <span className="text-xs font-medium" style={{ color: fg }}>
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
