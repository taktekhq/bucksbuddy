import { Linking, Text, View } from "react-native";
import { Mail } from "lucide-react-native";
import { NavHeader } from "@/components/ui/NavHeader";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { navigate } from "@/lib/router";
import { colors } from "@/lib/theme";

// The public contact page — deliberately tiny, like Legal. BucksBuddy is a
// personal money journal for a small circle, so "support" is just an email.
const CONTACT_EMAIL = "nizar@taktek.io";

export function Contact() {
  // Back returns to the landing (the signed-out home).
  return (
    // pb/pt: the web's `calc(2rem + var(--safe-bottom))` / `calc(1rem +
    // var(--safe-top))` — the padding here, the inset added by Screen.
    <Screen className="flex flex-col gap-6 px-4 pb-8 pt-4">
      {/* Plain iOS nav: back chevron + centered title — matches Settings/Legal. */}
      <NavHeader title="Contact" section onBack={() => navigate("/")} />

      <View className="flex flex-col gap-2">
        <View className="flex flex-col gap-4 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
          <Text className="text-[15px] leading-relaxed text-label">
            Questions, bugs, or feedback? Drop us a line and we'll get back to you.
          </Text>
          {/* `<a href="mailto:…">` styled as the carrot pill — opens the mail app. */}
          <Press
            onPress={() => {
              void Linking.openURL(`mailto:${CONTACT_EMAIL}`);
            }}
            accessibilityRole="link"
            className="flex items-center justify-center gap-2 rounded-pill bg-carrot py-3.5 text-base font-semibold text-white flex-row"
          >
            <Mail size={20} strokeWidth={2} color={colors.white} />
            <Text className="text-base font-semibold text-white">{CONTACT_EMAIL}</Text>
          </Press>
        </View>
      </View>
    </Screen>
  );
}
