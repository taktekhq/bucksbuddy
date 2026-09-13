// The gallery: every fixture as a card and as a story, with amounts and a
// name where the fixture asks for them. `window.exportPng(id)` runs the real
// export for one of them and resolves with a data URL, for scripted checks.
import { createRoot } from "react-dom/client";
import { useRef } from "react";
import { RecapCard } from "@/components/recap/RecapCard";
import { RecapStory } from "@/components/recap/RecapStory";
import { cleanName, monthFacts } from "@/lib/recap";
import { defaultTitle, eligibleTitles, FALLBACK_TITLES } from "@/lib/recapTitles";
import { buildRecapView } from "@/lib/recapView";
import { svgToPng } from "@/lib/recapExport";
import { coffeeMonth, foodMonth, legendaryMonth, weekendMonth, type Fixture } from "./fixtures";
import "@/index.css";

// Fixed "today", so the current-month fixture stays current-looking.
const NOW = new Date(2026, 8, 30, 15);

const FIXTURES: Fixture[] = [
  { id: "food", rows: foodMonth, key: "2026-09", currency: "USD" },
  { id: "food-amounts", rows: foodMonth, key: "2026-09", currency: "USD", name: "Alexandra Kowalczyk-Smith", amounts: true },
  { id: "coffee", rows: coffeeMonth, key: "2026-07", currency: "EUR", noCaption: true },
  { id: "weekend", rows: weekendMonth, key: "2026-08", currency: "USD" },
  { id: "legendary", rows: legendaryMonth, key: "2026-02", currency: "LBP", amounts: true, name: "Nizar" },
];

type Exporter = (id: string) => Promise<string>;
const exporters = new Map<string, () => Promise<string>>();
(window as unknown as { exportPng: Exporter }).exportPng = (id) => exporters.get(id)!();

function Preview({ f, story }: { f: Fixture; story?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const facts = monthFacts(f.rows(), f.key, NOW);
  const titles = eligibleTitles(facts);
  const view = buildRecapView(facts, {
    title: defaultTitle(facts),
    stamps: titles.filter((t) => !FALLBACK_TITLES.some((x) => x.id === t.id)),
    showCaption: !f.noCaption,
    showAmounts: !!f.amounts,
    name: cleanName(f.name ?? ""),
    currency: f.currency,
  });
  exporters.set(story ? `${f.id}-story` : f.id, async () => {
    const blob = await svgToPng(ref.current!, 1080);
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  });
  return (
    <div className="card">
      {story ? <RecapStory ref={ref} view={view} /> : <RecapCard ref={ref} view={view} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <>
    {FIXTURES.map((f) => <Preview key={f.id} f={f} />)}
    {FIXTURES.map((f) => <Preview key={`${f.id}-story`} f={f} story />)}
  </>,
);
