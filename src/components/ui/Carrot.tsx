type Props = {
  /** Tailwind font-size class drives the emoji size, e.g. "text-6xl". */
  className?: string;
  /** Looping hop (splash), one-shot wiggle, or still. */
  animation?: "hop" | "wiggle" | "none";
};

// The mascot. We render the real 🥕 emoji on purpose — on Apple devices that's
// the exact orange carrot the user asked for, straight from the system emoji
// font. No custom SVG can match "the carrot from the Apple emojis."
export function Carrot({ className = "text-5xl", animation = "none" }: Props) {
  const anim = animation === "hop" ? "animate-hop" : animation === "wiggle" ? "animate-wiggle" : "";
  return (
    <span
      role="img"
      aria-label="carrot"
      className={`inline-block leading-none ${anim} ${className}`}
    >
      🥕
    </span>
  );
}
