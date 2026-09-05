import { Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { back } from "@/lib/router";
import { colors } from "@/lib/theme";

// The plain iOS nav bar every sub-page repeats verbatim on the web —
// `<header class="relative flex items-center justify-center py-1">` with a
// back chevron pinned left and a centered title. It has no component of its
// own there; each page inlines it. Here it's one component, with the web's
// three title looks:
//
//   • Legal / Contact — the title is a `<SectionHeader>` (`section`).
//   • Settings — `font-display text-base font-bold uppercase text-label-muted`.
//   • The dark rooms (History / Stats / Receipts / Safe) — `dark`, which adds
//     `tracking-wide text-white/90`.
//
// `tint` recolors the chevron (the Safe's is gold; everywhere else carrot,
// the web's `text-carrot`). Back pops the native stack by default.
export function NavHeader({
  title,
  onBack = back,
  dark = false,
  tint = colors.carrot,
  section = false,
}: {
  title: string;
  onBack?: () => void;
  dark?: boolean;
  tint?: string;
  /** Legal/Contact title the web renders as a `<SectionHeader>`. */
  section?: boolean;
}) {
  return (
    <View className="relative flex items-center justify-center py-1">
      {/* `text-carrot` is the chevron's color, which lucide takes as a prop. */}
      <Press onPress={onBack} accessibilityLabel="Back" className="absolute left-0 -m-2 p-2" hitSlop={8}>
        <ChevronLeft size={24} strokeWidth={2.5} color={tint} />
      </Press>
      {section ? (
        <SectionHeader>{title}</SectionHeader>
      ) : (
        <Text
          className={
            dark
              ? "font-display text-base font-bold uppercase tracking-wide text-white/90"
              : "font-display text-base font-bold uppercase text-label-muted"
          }
        >
          {title}
        </Text>
      )}
    </View>
  );
}
