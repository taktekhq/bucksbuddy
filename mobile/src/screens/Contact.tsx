import { Linking, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, Mail } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";
import { colors, radius, shadows, space, text, weight } from "@/lib/theme";

// The public contact page — deliberately tiny, like Legal. BucksBuddy is a
// personal money journal for a small circle, so "support" is just an email.
const CONTACT_EMAIL = "nizar@taktek.io";

export function Contact() {
  // Back returns to the landing (the signed-out home).
  return (
    <Screen gap={space(6)}>
      {/* Plain iOS nav: back chevron + centered title — matches Settings/Legal. */}
      <View style={styles.header}>
        <Press
          onPress={() => navigate("/")}
          accessibilityLabel="Back"
          style={styles.back}
          hitSlop={8}
        >
          <ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
        </Press>
        <SectionHeader>Contact</SectionHeader>
      </View>

      <View style={styles.section}>
        <View style={styles.card}>
          <Text style={styles.body}>
            Questions, bugs, or feedback? Drop us a line and we'll get back to you.
          </Text>
          {/* `<a href="mailto:…">` styled as the carrot pill — opens the mail app. */}
          <Press
            onPress={() => {
              void Linking.openURL(`mailto:${CONTACT_EMAIL}`);
            }}
            accessibilityRole="link"
            style={styles.mail}
          >
            <Mail size={20} strokeWidth={2} color={colors.white} />
            <Text style={styles.mailText}>{CONTACT_EMAIL}</Text>
          </Press>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // relative flex items-center justify-center py-1
  header: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space(1),
  },
  // absolute left-0 -m-2 p-2 text-carrot
  back: {
    position: "absolute",
    left: -space(2),
    top: 0,
    bottom: 0,
    justifyContent: "center",
    padding: space(2),
  },
  section: { gap: space(2) },
  // flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card
  card: {
    gap: space(4),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space(5),
    boxShadow: shadows.card,
  },
  // text-[15px] leading-relaxed text-label (15 × 1.625 = 24.375 → 24)
  body: { fontSize: 15, lineHeight: 24, color: colors.label },
  // flex items-center justify-center gap-2 rounded-pill bg-carrot py-3.5
  mail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    borderRadius: radius.pill,
    backgroundColor: colors.carrot,
    paddingVertical: space(3.5),
  },
  // text-base font-semibold text-white
  mailText: { ...text.base, fontWeight: weight.semibold, color: colors.white },
});
