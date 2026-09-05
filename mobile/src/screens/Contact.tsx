import { Linking, StyleSheet, Text, View } from "react-native";
import { Mail } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { navigate } from "@/lib/router";
import { colors, radius, shadowCard } from "@/lib/theme";

// The public contact page — deliberately tiny, like Legal. BucksBuddy is a
// personal money journal for a small circle, so "support" is just an email.
const CONTACT_EMAIL = "nizar@taktek.io";

export function Contact() {
  // Back returns to the landing (the signed-out home).
  return (
    <Screen gap={24}>
      <NavHeader title="Contact" onBack={() => navigate("/")} />

      <View style={styles.card}>
        <Text style={styles.body}>
          Questions, bugs, or feedback? Drop us a line and we'll get back to you.
        </Text>
        <Press
          onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
          style={styles.button}
        >
          <Mail size={20} strokeWidth={2} color="#FFF" />
          <Text style={styles.buttonText}>{CONTACT_EMAIL}</Text>
        </Press>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: 20,
    ...shadowCard,
  },
  body: { fontSize: 15, lineHeight: 24, color: colors.label },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.carrot,
    paddingVertical: 14,
  },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: "#FFF" },
});
