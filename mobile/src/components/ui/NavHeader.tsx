import { StyleSheet, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { back } from "@/lib/router";
import { colors, display, text, trackingWide, white } from "@/lib/theme";

// The plain iOS nav bar every sub-page shares: a back chevron pinned left
// (`absolute left-0 -m-2 p-2`) and a centered Grobold title. `dark` is the
// version for the dark rooms (white title, wider tracking); `tint` recolors
// the chevron (the Safe uses gold). Back pops the native stack by default.
export function NavHeader({
  title,
  onBack = back,
  dark = false,
  tint = colors.carrot,
}: {
  title: string;
  onBack?: () => void;
  dark?: boolean;
  tint?: string;
}) {
  return (
    <View style={styles.bar}>
      <Press onPress={onBack} accessibilityLabel="Back" style={styles.back} hitSlop={8}>
        <ChevronLeft size={24} strokeWidth={2.5} color={tint} />
      </Press>
      <Text style={[styles.title, dark ? styles.dark : styles.light]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4, // py-1
  },
  back: {
    position: "absolute",
    left: -8, // -m-2
    top: 0,
    bottom: 0,
    justifyContent: "center",
    padding: 8, // p-2
  },
  title: { ...display, ...text.base },
  light: { color: colors.labelMuted },
  dark: { color: white(0.9), letterSpacing: trackingWide(16) },
});
