// Shown instantly while /add's server component (auth + rate) resolves, so
// tapping the + button feels immediate instead of laggy.
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[calc(0.5rem+var(--safe-top))]">
      <header className="flex items-center justify-between py-2">
        <span className="text-base text-carrot">Cancel</span>
        <h1 className="text-base font-semibold">New Entry</h1>
        <span className="w-12" />
      </header>
      <div className="flex flex-1 items-center justify-center">
        <span className="animate-pulse text-3xl">🥕</span>
      </div>
    </main>
  );
}
