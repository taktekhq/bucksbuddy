import { Linking, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";
import { colors, radius, shadowCard } from "@/lib/theme";

// The public legal page. BucksBuddy is a personal money journal for a small
// circle, so this says the true things plainly rather than burying them in
// boilerplate. The Privacy section is intentionally specific about Google user
// data — Google's API verification requires the policy to spell out exactly
// what Google data we access and how we use it. Privacy and Terms share one
// page, each its own section. Reached from the landing's "Privacy and Terms"
// button.
function Link({ href, children }: { href: string; children: string }) {
  return (
    <Text style={styles.link} onPress={() => void Linking.openURL(href)}>
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.body}>•</Text>
      <Text style={[styles.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Legal() {
  // Back returns to the landing (the signed-out home).
  return (
    <Screen gap={24}>
      <NavHeader title="Legal" onBack={() => navigate("/")} />

      <View style={styles.section}>
        <SectionHeader>Privacy</SectionHeader>
        <View style={styles.card}>
          <Text style={styles.body}>BucksBuddy keeps it simple:</Text>
          <View style={styles.list}>
            <Bullet>We store your entries only to show them back to you.</Bullet>
            <Bullet>
              To create your account, we only take your name, email, and ID (OpenID) from Google.
            </Bullet>
            <Bullet>No ads, and we don't sell your data.</Bullet>
            <Bullet>Turn on end-to-end encryption and not even we can read your numbers.</Bullet>
            <Bullet>Delete your account anytime to wipe your data.</Bullet>
          </View>

          <Text style={[styles.body, styles.heading]}>Google user data we access</Text>
          <Text style={styles.body}>
            Signing in with Google is the only way into BucksBuddy. Using the standard openid, email,
            and profile scopes, we receive your Google account ID (OpenID), email address, name, and
            profile picture. We do not request access to any other Google data or API (no Gmail,
            Drive, Contacts, or Calendar).
          </Text>

          <Text style={[styles.body, styles.heading]}>How we use Google user data</Text>
          <Text style={styles.body}>
            We use it only to create and secure your account, sign you in, identify you in the app,
            and email you about your account or support. We never use it for advertising or
            profiling. Your data is stored by our hosting provider (Supabase), encrypted in transit,
            and never sold, rented, or shared with third parties except as needed to run BucksBuddy
            or where required by law. BucksBuddy's use and transfer of Google user data adheres to
            the{" "}
            <Link href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </Link>
            , including the Limited Use requirements.
          </Text>
          <Text style={styles.body}>
            Delete your account anytime from Settings to permanently wipe your data, or revoke access
            from your{" "}
            <Link href="https://myaccount.google.com/permissions">Google Account permissions</Link>.
            Questions? Email <Link href="mailto:nizar@taktek.io">nizar@taktek.io</Link>.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader>Terms</SectionHeader>
        <View style={styles.card}>
          <Text style={styles.body}>The short version:</Text>
          <View style={styles.list}>
            <Bullet>BucksBuddy is a personal money journal, offered as-is.</Bullet>
            <Bullet>Track your own money — nothing illegal.</Bullet>
            <Bullet>You're responsible for your account and what you put in it.</Bullet>
          </View>
          <Text style={styles.body}>That's all, folks. 🥕</Text>
        </View>
      </View>

      <Text style={styles.updated}>Last updated June 2026.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  card: {
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: 20,
    ...shadowCard,
  },
  body: { fontSize: 15, lineHeight: 24, color: colors.label },
  heading: { paddingTop: 8, fontWeight: "600" },
  list: { gap: 8, paddingLeft: 8 },
  bullet: { flexDirection: "row", gap: 8 },
  link: { color: colors.carrot, textDecorationLine: "underline" },
  updated: { paddingHorizontal: 8, fontSize: 12, lineHeight: 16, color: colors.labelSecondary },
});
