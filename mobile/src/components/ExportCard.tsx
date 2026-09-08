import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Check, ChevronDown, Download } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Press } from "@/components/ui/Press";
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
import { colors } from "@/lib/theme";

export type ExportFormat = "csv" | "pdf";

// Export, as a two-step card in the same spirit as the delete confirmation: one
// row until you tap it, then the range choices and the two formats. Everything
// comes from the decrypted rows already in memory (the database only holds
// ciphertext), so there's no query. On native the file goes to the cache dir
// and out through the share sheet (the browser's download).
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
    const file = new File(Paths.cache, exportFilename(range, format, now));
    try {
      if (format === "csv") {
        file.write(transactionsToCsv(picked));
      } else {
        file.write(
          transactionsToPdf(
            picked,
            { title: "BucksBuddy", rangeLabel: exportRangeLabel(range, now) },
            now,
          ),
        );
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(
          file.uri,
          format === "csv"
            ? { mimeType: "text/csv", UTI: "public.comma-separated-values-text" }
            : { mimeType: "application/pdf", UTI: "com.adobe.pdf" },
        );
      }

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
    } catch {
      // Share sheet dismissed or storage unavailable — nothing to report.
    }
  }

  if (!open || masked) {
    // `overflow-hidden` in the same string as `shadow-card` clips the shadow
    // away on native (PORTING.md §4), so the clip moves to an inner View.
    return (
      <View className="rounded-card bg-surface shadow-card">
        <View className="overflow-hidden rounded-card">
          <Press
            onPress={() => setOpen(true)}
            disabled={masked}
            accessibilityRole="button"
            className="flex w-full flex-row items-center justify-between px-4 py-3.5 text-base font-medium text-label disabled:opacity-50"
          >
            <Text className="text-base font-medium text-label">Export</Text>
            <Download size={20} strokeWidth={2} color={colors.labelSecondary} />
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View className="rounded-card bg-surface shadow-card">
      <View className="overflow-hidden rounded-card">
        <Press
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          className="flex w-full flex-row items-center justify-between px-4 py-3.5 text-base font-medium text-label"
        >
          <Text className="text-base font-medium text-label">Export</Text>
          <ChevronDown size={20} strokeWidth={2} color={colors.labelSecondary} />
        </Press>

        {/* The range choices — an iOS settings list, one tick on the active row.
            `divide-y` isn't supported (PORTING.md §4). The web's `divide-y` is
            on the CARD, so it separates the card's three children — header,
            this group, the footer — and draws nothing between the rows inside
            this group. The `border-t` goes here, not on each row. */}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Export range"
          className="border-t border-separator"
        >
          {EXPORT_RANGES.map((option) => (
            <Press
              key={option.id}
              onPress={() => setRange(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: option.id === range }}
              className="flex w-full flex-row items-center justify-between px-4 py-3 text-base text-label"
            >
              <Text className="text-base text-label">{option.label}</Text>
              {option.id === range && (
                <Check size={20} strokeWidth={2.5} color={colors.carrot} />
              )}
            </Press>
          ))}
        </View>

        <View className="flex flex-col gap-3 border-t border-separator p-4">
          <Text className="text-center text-sm text-label-secondary">
            {rows.length} {rows.length === 1 ? "entry" : "entries"} ·{" "}
            {exportRangeLabel(range)}
          </Text>
          <View className="flex flex-row gap-3">
            <Press
              onPress={() => exportAs("csv")}
              accessibilityRole="button"
              className="flex-1 rounded-pill bg-carrot py-3 text-base font-semibold text-surface shadow-carrot transition"
            >
              <Text className="text-center text-base font-semibold text-surface">
                CSV
              </Text>
            </Press>
            <Press
              onPress={() => exportAs("pdf")}
              accessibilityRole="button"
              className="flex-1 rounded-pill bg-grouped py-3 text-base font-semibold text-label transition"
            >
              <Text className="text-center text-base font-semibold text-label">
                PDF
              </Text>
            </Press>
          </View>
        </View>
      </View>
    </View>
  );
}
