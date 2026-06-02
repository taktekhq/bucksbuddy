import { Home as HomeIcon, Plus } from "lucide-react";

export type Tab = "add" | "summary";

const TABS: { id: Tab; label: string; Icon: typeof Plus }[] = [
  { id: "add", label: "Add", Icon: Plus },
  { id: "summary", label: "Home", Icon: HomeIcon },
];

// Plain iOS bottom tab bar: surface with a hairline top, carrot for the active
// tab. Sits inside the app's max-w-md column.
export function TabBar({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-separator bg-surface/95 pb-[var(--safe-bottom)] backdrop-blur">
      <div className="grid grid-cols-2">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="press flex flex-col items-center gap-0.5 py-2"
            >
              <Icon
                className={`h-6 w-6 ${active ? "text-carrot" : "text-label-secondary"}`}
                strokeWidth={2}
              />
              <span
                className={`text-[11px] font-medium ${active ? "text-carrot" : "text-label-secondary"}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
