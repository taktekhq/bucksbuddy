import { Text } from "react-native";

type Props = {
  /** Tailwind font-size className drives the emoji size, e.g. "text-6xl". */
  className?: string;
};

// The mascot. We render the real 🥕 emoji on purpose — on Apple devices that's
// the exact orange carrot the user asked for, straight from the system emoji
// font. No custom SVG can match "the carrot from the Apple emojis." Static by
// design: the carrot sits still. Mirrors src/components/ui/Carrot.tsx.
export function Carrot({ className = "text-5xl" }: Props) {
  return (
    <Text accessibilityLabel="carrot" accessibilityRole="image" className={`leading-none ${className}`}>
      🥕
    </Text>
  );
}
