import type { ReactNode } from "react";
import { Linking, Text, View } from "react-native";
import { NavHeader } from "@/components/ui/NavHeader";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { navigate } from "@/lib/router";

// The public legal page. BucksBuddy is a personal money journal for a small
// circle, so this says the true things plainly rather than burying them in
// boilerplate. The Privacy section is intentionally specific about Google user
// data — Google's API verification requires the policy to spell out exactly
// what Google data we access and how we use it. Privacy and Terms share one
// page, each its own section. Reached from the landing's "Privacy and Terms"
// button.

// `<a class="text-carrot underline">` — a Text nested in the paragraph's Text,
// so it wraps inline like the anchor does, opening in the system browser or
// mail app.
function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Text
      className="text-carrot underline"
      accessibilityRole="link"
      onPress={() => {
        void Linking.openURL(href);
      }}
    >
      {children}
    </Text>
  );
}

// One `<li>` of the web's `list-disc … pl-5` list. React Native has no list
// markers, so the disc is drawn into a 20pt gutter (`w-5`, the web's `pl-5`)
// and the copy takes the rest of the row. The card's text classes are repeated
// on both, since text styles don't inherit through a View.
function Bullet({ children }: { children: ReactNode }) {
  return (
    <View className="flex flex-row">
      <Text className="w-5 text-center text-[15px] leading-relaxed text-label">•</Text>
      <Text className="flex-1 text-[15px] leading-relaxed text-label">{children}</Text>
    </View>
  );
}

export function Legal() {
  // Back returns to the landing (the signed-out home).
  return (
    // pb/pt: the web's `calc(2rem + var(--safe-bottom))` / `calc(1rem +
    // var(--safe-top))` — the padding here, the inset added by Screen.
    <Screen className="flex flex-col gap-6 px-4 pb-8 pt-4">
      {/* Plain iOS nav: back chevron + centered title — matches Settings. */}
      <NavHeader title="Legal" section onBack={() => navigate("/")} />

      <View className="flex flex-col gap-2">
        <SectionHeader>Privacy</SectionHeader>
        <View className="flex flex-col gap-3 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
          <Text className="text-[15px] leading-relaxed text-label">BucksBuddy keeps it simple:</Text>
          {/* list-disc / pl-5 live in Bullet — see above. */}
          <View className="flex flex-col gap-2">
            <Bullet>We store your entries only to show them back to you.</Bullet>
            <Bullet>
              To create your account, we only take your name, email, and ID (OpenID) from Google.
            </Bullet>
            <Bullet>No ads, and we don't sell your data.</Bullet>
            <Bullet>
              Turn on end-to-end encryption and not even we can read your numbers.
            </Bullet>
            <Bullet>Delete your account anytime to wipe your data.</Bullet>
          </View>

          <Text className="pt-2 font-semibold text-label text-[15px] leading-relaxed">
            Google user data we access
          </Text>
          <Text className="text-[15px] leading-relaxed text-label">
            Signing in with Google is the only way into BucksBuddy. Using the standard openid,
            email, and profile scopes, we receive your Google account ID (OpenID), email address,
            name, and profile picture. We do not request access to any other Google data or API (no
            Gmail, Drive, Contacts, or Calendar).
          </Text>

          <Text className="pt-2 font-semibold text-label text-[15px] leading-relaxed">
            How we use Google user data
          </Text>
          <Text className="text-[15px] leading-relaxed text-label">
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
          <Text className="text-[15px] leading-relaxed text-label">
            Delete your account anytime from Settings to permanently wipe your data, or revoke
            access from your{" "}
            <Link href="https://myaccount.google.com/permissions">Google Account permissions</Link>.
            Questions? Email <Link href="mailto:nizar@taktek.io">nizar@taktek.io</Link>.
          </Text>
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <SectionHeader>Terms</SectionHeader>
        <View className="flex flex-col gap-3 rounded-card bg-surface p-5 text-[15px] leading-relaxed text-label shadow-card">
          <Text className="text-[15px] leading-relaxed text-label">The short version:</Text>
          <View className="flex flex-col gap-2">
            <Bullet>BucksBuddy is a personal money journal, offered as-is.</Bullet>
            <Bullet>Track your own money — nothing illegal.</Bullet>
            <Bullet>You're responsible for your account and what you put in it.</Bullet>
          </View>
          <Text className="text-[15px] leading-relaxed text-label">That's all, folks. 🥕</Text>
        </View>
      </View>

      <Text className="px-2 text-xs text-label-secondary">Last updated June 2026.</Text>
    </Screen>
  );
}
