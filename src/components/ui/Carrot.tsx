type Props = {
  /** Tailwind font-size class drives the emoji size, e.g. "text-6xl". */
  className?: string;
};

// The mascot. We render the real 🥕 emoji on purpose — on Apple devices that's
// the exact orange carrot the user asked for, straight from the system emoji
// font. No custom SVG can match "the carrot from the Apple emojis." Static by
// design: the carrot sits still.
export function Carrot({ className = "text-5xl" }: Props) {
  return (
    <span role="img" aria-label="carrot" className={`inline-block leading-none ${className}`}>
      🥕
    </span>
  );
}
