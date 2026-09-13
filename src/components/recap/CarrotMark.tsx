// The brand mark as it goes on a card: a drawn carrot, not the emoji. The app
// itself shows the real 🥕 (see components/ui/Carrot) because on an iPhone
// that's exactly the mascot — but a card is an image other people open on
// other phones, and an emoji baked into a PNG comes out as whichever emoji
// font the exporting device had. Vector paths look the same everywhere.
export function CarrotMark({
  x = 0,
  y = 0,
  size = 48,
}: {
  x?: number;
  y?: number;
  size?: number;
}) {
  const s = size / 48;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} aria-hidden="true">
      {/* leaves */}
      <path
        d="M31 4c-4 2-6 6-6 10 0 0 8-1 11-5 2-2 2-5-5-5z"
        fill="#5AA82F"
      />
      <path
        d="M33 13c-3-3-8-3-11-1 0 0 4 6 9 6 3 0 4-2 2-5z"
        fill="#7AC143"
      />
      <path
        d="M22 15c-1-4 1-8 5-11-4 2-8 7-7 12 1 0 2-1 2-1z"
        fill="#3F8E22"
      />
      {/* body */}
      <path
        d="M24 16c6-2 12 4 10 10L14 46c-2 2-6 0-5-3z"
        fill="#F56300"
      />
      <path
        d="M26 18c3-1 7 2 6 6L15 43c-1 1-2 0-2-1z"
        fill="#FF8A3D"
        opacity="0.55"
      />
      {/* ridges */}
      <path
        d="M27 25l-6 1M24 31l-6 1M21 37l-5 1"
        stroke="#C44E00"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}
