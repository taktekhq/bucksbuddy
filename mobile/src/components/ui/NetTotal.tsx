import { Text, View } from "react-native";
import { formatSignedUsdCents } from "@/lib/money";

// The web imports `netColorClass` from lib/money; this app's copy of that
// module exports `netColor` (a hex, for the places React Native takes a color
// as a *prop*) but not the class version yet, so the web's exact class list
// lives here until it does.
function netColorClass(cents: number): string {
  if (cents > 0) return "text-income";
  if (cents < 0) return "text-expense";
  return "text-label";
}

// Clean Apple stat: a small caption on top, the net number below it,
// green/red by direction. Left-aligned. When `masked` (the device is locked),
// the number is obscured.
export function NetTotal({
  cents,
  label,
  masked = false,
}: {
  cents: number;
  label: string;
  masked?: boolean;
}) {
  return (
    <View>
      <Text className="text-[13px] font-medium uppercase tracking-wide text-label-secondary">
        {label}
      </Text>
      <Text
        className={`mt-1 font-numeric text-4xl font-bold tabular-nums ${
          masked ? "text-label-muted" : netColorClass(cents)
        }`}
      >
        {masked ? "$•••••" : formatSignedUsdCents(cents)}
      </Text>
    </View>
  );
}
