import { Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/lib/theme";

// The plain iOS nav bar every sub-page repeats verbatim on the web —
// `<header class="relative flex items-center justify-center py-1">` with a
// back chevron pinned left and a centered title. It has no component of its
// own there; each page inlines it. Here it's one component, with the web's
// three title looks:
//
// The dark rooms (History, Stats, Receipts, Safe) inline their own header
// because their chevron and title are tinted per room; this covers the two
// light pages, Legal and Contact, whose title the web renders as a
// `<SectionHeader>`. Back pops the native stack by default.
export function NavHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="relative flex items-center justify-center py-1">
      {/* `text-carrot` is the chevron's color, which lucide takes as a prop. */}
      <Press onPress={onBack} accessibilityLabel="Back" className="absolute left-0 -m-2 p-2" hitSlop={8}>
        <ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
      </Press>
      <SectionHeader>{title}</SectionHeader>
    </View>
  );
}
