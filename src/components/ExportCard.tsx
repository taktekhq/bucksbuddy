import { useEffect, useState } from "react";
import { Check, ChevronDown, Download } from "lucide-react";
import { transactionsToCsv } from "@/lib/csv";
import { transactionsToPdf } from "@/lib/pdf";
import {
  DEFAULT_EXPORT_RANGE,
  EXPORT_RANGES,
  exportFilename,
  exportRangeLabel,
  filterByExportRange,
  type ExportRangeId,
} from "@/lib/exportRange";
import { FETCH_CAP } from "@/lib/stats";
import { useStore } from "@/lib/store";
import posthog from "@/lib/posthog";

export type ExportFormat = "csv" | "pdf";

// Hand the finished file over. Inside an iOS home-screen app a plain download
// link is the wrong tool: depending on the iOS version it does nothing, or
// opens a preview the user cannot leave without leaving the app. Where the
// browser can share files (Safari 15+, Chrome on Android) the OS share sheet is
// how a file leaves a phone, the same path every other app uses. Desktop
// browsers, and anything older, get the download link.
//
// Must be reached synchronously from the tap: the share sheet only opens
// inside the user gesture that asked for it, so there is no await before it.
//
// Resolves false when the user closed the sheet without picking a target: no
// file went anywhere, so the caller reports nothing.
async function deliverFile(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      // A share target that refused the file: fall through to the download so
      // the export still happens.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// Export, as a two-step card in the same spirit as the delete confirmation: one
// row until you tap it, then the range choices and the two formats. Everything
// comes from the decrypted rows already in memory (the database only holds
// ciphertext), so there's no query and nothing to await.
export function ExportCard() {
  const { transactions, locked } = useStore();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<ExportRangeId>(DEFAULT_EXPORT_RANGE);

  // `locked` alone isn't enough: store.unlock() clears it BEFORE awaiting the
  // reload, so for one network-plus-decrypt window the rows are still the
  // masked stand-ins (amount 0, no note) while locked reads false. Exporting
  // then writes a file of real dates against 0.00 amounts. Same test the rest
  // of the app uses for this (see screens/Receipts).
  const masked = locked || transactions.some((t) => t.amountMask != null);

  // Collapse on lock rather than only hiding: otherwise `open` survives and the
  // card springs back open, buttons live, the moment it unmasks.
  useEffect(() => {
    if (masked) setOpen(false);
  }, [masked]);

  const rows = filterByExportRange(transactions, range);

  async function exportAs(format: ExportFormat) {
    const now = new Date();
    const picked = filterByExportRange(transactions, range, now);
    const blob =
      format === "csv"
        ? new Blob([transactionsToCsv(picked)], { type: "text/csv;charset=utf-8" })
        : new Blob(
            [
              transactionsToPdf(
                picked,
                { title: "BucksBuddy", rangeLabel: exportRangeLabel(range, now) },
                now,
              ),
            ],
            { type: "application/pdf" },
          );

    const delivered = await deliverFile(blob, exportFilename(range, format, now));
    if (!delivered) return;

    posthog.capture(format === "csv" ? "csv_exported" : "pdf_exported", {
      range,
      row_count: picked.length,
    });
    // The store only ever holds the newest FETCH_CAP rows, so at the cap an
    // "all time" export is quietly partial. Nobody has that many entries yet;
    // this is the tripwire that tells us when someone does.
    if (transactions.length >= FETCH_CAP) {
      posthog.capture("export_truncated", {
        range,
        format,
        row_count: picked.length,
        fetch_cap: FETCH_CAP,
      });
    }
  }

  if (!open || masked) {
    return (
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={masked}
          className="press flex w-full items-center justify-between px-4 py-3.5 text-base font-medium text-label disabled:opacity-50"
        >
          <span>Export</span>
          <Download className="h-5 w-5 text-label-secondary" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-separator overflow-hidden rounded-card bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="press flex w-full items-center justify-between px-4 py-3.5 text-base font-medium text-label"
      >
        <span>Export</span>
        <ChevronDown className="h-5 w-5 text-label-secondary" strokeWidth={2} />
      </button>

      {/* The range choices — an iOS settings list, one tick on the active row. */}
      <div role="radiogroup" aria-label="Export range">
        {EXPORT_RANGES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === range}
            onClick={() => setRange(option.id)}
            className="press flex w-full items-center justify-between px-4 py-3 text-base text-label"
          >
            <span>{option.label}</span>
            {option.id === range && (
              <Check className="h-5 w-5 text-carrot" strokeWidth={2.5} />
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-center text-sm text-label-secondary">
          {rows.length} {rows.length === 1 ? "entry" : "entries"} ·{" "}
          {exportRangeLabel(range)}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => exportAs("csv")}
            className="press flex-1 rounded-pill bg-carrot py-3 text-base font-semibold text-surface shadow-carrot transition"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportAs("pdf")}
            className="press flex-1 rounded-pill bg-grouped py-3 text-base font-semibold text-label transition"
          >
            PDF
          </button>
        </div>
      </div>
    </div>
  );
}
