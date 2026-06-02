import { AddComposer } from "@/components/AddComposer";
import type { Transaction } from "@/types/db";

// The "Add" tab — the dial gets the whole screen.
export function Add({
  editing,
  onClearEdit,
}: {
  editing: Transaction | null;
  onClearEdit: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-4 pt-[calc(1rem+var(--safe-top))]">
      <section className="rounded-card bg-surface shadow-card">
        <AddComposer editing={editing} onClearEdit={onClearEdit} />
      </section>
    </main>
  );
}
