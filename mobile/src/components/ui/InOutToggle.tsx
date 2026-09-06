import { Text, View } from "react-native";
import { Press } from "@/components/ui/Press";

type Props = {
  isIncome: boolean;
  onChange: (isIncome: boolean) => void;
};

// Segmented control on a plain Apple track. The active side fills with money
// color — red for Out, green for In — so direction reads instantly.
//
// The web's `grid grid-cols-2` is two equal columns; React Native has no grid,
// so the track is `flex-row` and each segment takes `flex-1` (PORTING §4).
// Everything else is the web's class string, `transition` included — NativeWind
// drives the fill change itself, no Reanimated interpolation needed. The color
// class is repeated on each `Text` because text styles don't inherit (§2a).
export function InOutToggle({ isIncome, onChange }: Props) {
  return (
    <View className="flex-row gap-1 rounded-pill bg-grouped p-1">
      <Press
        onPress={() => onChange(false)}
        className={`flex-1 rounded-pill py-2.5 text-base font-semibold transition ${
          !isIncome ? "bg-expense text-white shadow-segment" : "text-label-secondary"
        }`}
      >
        <Text
          className={`text-center text-base font-semibold transition ${
            !isIncome ? "text-white" : "text-label-secondary"
          }`}
        >
          Out
        </Text>
      </Press>
      <Press
        onPress={() => onChange(true)}
        className={`flex-1 rounded-pill py-2.5 text-base font-semibold transition ${
          isIncome ? "bg-income text-white shadow-segment" : "text-label-secondary"
        }`}
      >
        <Text
          className={`text-center text-base font-semibold transition ${
            isIncome ? "text-white" : "text-label-secondary"
          }`}
        >
          In
        </Text>
      </Press>
    </View>
  );
}
