import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

// Honest placeholder for a Phase 2 screen not built yet — see
// docs/EXPO_MIGRATION.md's screen order (Home → AddComposer → History →
// Safe → Stats → Settings). Registering the route now (rather than leaving
// it 404) keeps Home's navigation working and expo-router's typed routes
// honest about what actually exists.
export function ComingSoonScreen({ title }: { title: string }) {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-row items-center gap-2 px-2 pt-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="p-2">
          <ChevronLeft size={24} strokeWidth={2} color="#1C1C1E" />
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-center gap-2 px-8">
        <Text className="font-display text-xl font-bold text-label">{title}</Text>
        <Text className="text-center text-label-secondary">Coming soon — this screen hasn't been ported yet.</Text>
      </View>
    </SafeAreaView>
  );
}
