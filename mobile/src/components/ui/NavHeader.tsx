import { StyleSheet, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { colors, display, white } from "@/lib/theme";

// The plain iOS nav bar every sub-page shares: a back chevron pinned left and
// a centered Grobold title. `dark` is the version for the dark rooms (white
// title, wider tracking); `tint` recolors the chevron (the Safe uses gold).
export function NavHeader({
  title,
  onBack,
  dark = false,
  tint = colors.carrot,
}: {
  title: string;
  onBack: () => void;
  dark?: boolean;
  tint?: string;
}) {
  return (
    <View style={styles.bar}>
      <Press
        onPress={onBack}
        accessibilityLabel="Back"
        style={styles.back}
        hitSlop={8}
      >
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
    paddingVertical: 4,
  },
  back: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    padding: 8,
    margin: -8,
    marginLeft: -8,
  },
  title: { ...display, fontSize: 16, lineHeight: 24 },
  light: { color: colors.labelMuted },
  dark: { color: white(0.9), letterSpacing: 0.4 },
});
