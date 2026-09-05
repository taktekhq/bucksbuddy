import { Pressable, Text, View } from "react-native";

type Props = {
  isIncome: boolean;
  onChange: (isIncome: boolean) => void;
};

// Segmented control on a plain Apple track. The active side fills with money
// color — red for Out, green for In — so direction reads instantly. Mirrors
// src/components/ui/InOutToggle.tsx.
export function InOutToggle({ isIncome, onChange }: Props) {
  return (
    <View className="flex-row gap-1 rounded-pill bg-grouped p-1">
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(false)}
        className={`flex-1 items-center rounded-pill py-2.5 ${!isIncome ? "bg-expense shadow-segment" : ""}`}
      >
        <Text className={`text-base font-semibold ${!isIncome ? "text-white" : "text-label-secondary"}`}>Out</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(true)}
        className={`flex-1 items-center rounded-pill py-2.5 ${isIncome ? "bg-income shadow-segment" : ""}`}
      >
        <Text className={`text-base font-semibold ${isIncome ? "text-white" : "text-label-secondary"}`}>In</Text>
      </Pressable>
    </View>
  );
}
