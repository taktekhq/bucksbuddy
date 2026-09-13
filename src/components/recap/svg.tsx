// Small SVG building blocks shared by the trading card and the story: text
// set in one of the card fonts, sparkles, stars, and the foil gradients that
// give a rarity its shine. Pure presentational SVG — no state, no DOM APIs —
// so the same markup is the preview and the export.
import type { ReactNode } from "react";
import { FONT_FAMILY, FONT_WEIGHT, type FontId } from "@/lib/recapText";
import type { Rarity } from "@/lib/recap";
import { FOIL } from "./palette";

export function T({
  x,
  y,
  font,
  size,
  fill,
  anchor = "start",
  spacing,
  opacity,
  children,
}: {
  x: number;
  y: number; // baseline
  font: FontId;
  size: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  opacity?: number;
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fontFamily={FONT_FAMILY[font]}
      fontWeight={FONT_WEIGHT[font]}
      fontSize={size}
      fill={fill}
      textAnchor={anchor}
      letterSpacing={spacing}
      opacity={opacity}
    >
      {children}
    </text>
  );
}

/** A four-pointed glint, `r` wide, centered on (x, y). */
export function Sparkle({
  x,
  y,
  r,
  rotate = 0,
  fill = "#ffffff",
  opacity = 0.9,
}: {
  x: number;
  y: number;
  r: number;
  rotate?: number;
  fill?: string;
  opacity?: number;
}) {
  const k = r * 0.22;
  const d =
    `M0,${-r} C0,${-k} ${k},0 ${r},0 C${k},0 0,${k} 0,${r} ` +
    `C0,${k} ${-k},0 ${-r},0 C${-k},0 0,${-k} 0,${-r} Z`;
  return (
    <path d={d} fill={fill} opacity={opacity} transform={`translate(${x} ${y}) rotate(${rotate})`} />
  );
}

/** A five-pointed star, `r` from center to tip, centered on (x, y). */
export function Star({
  x,
  y,
  r,
  fill,
  opacity = 1,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
  opacity?: number;
}) {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return <polygon points={points.join(" ")} fill={fill} opacity={opacity} />;
}

/** The rarity's stars: `count` of five lit, the rest faint. */
export function RarityStars({
  x,
  y,
  count,
  size = 12,
  gap = 8,
  fill,
}: {
  x: number; // left edge
  y: number; // center
  count: number;
  size?: number;
  gap?: number;
  fill: string;
}) {
  return (
    <g>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          x={x + size + i * (size * 2 + gap)}
          y={y}
          r={size}
          fill={fill}
          opacity={i < count ? 1 : 0.22}
        />
      ))}
    </g>
  );
}

function stops(colors: string[]) {
  return colors.map((color, i) => (
    <stop key={i} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={color} />
  ));
}

/**
 * Gradient and filter definitions the foils use. Ids are prefixed so the
 * card and the story can sit on one page without their defs colliding.
 */
export function FoilDefs({
  prefix,
  base,
  glow,
  second,
}: {
  prefix: string;
  base: string;
  glow: string;
  second?: string; // a dual-type card's second color
}) {
  return (
    <defs>
      <linearGradient id={`${prefix}-sheen`} x1="0" y1="0" x2="1" y2="1">
        {stops([base, glow, base, glow, base])}
      </linearGradient>
      {/* The dual-type split: the two type colors, corner to corner. */}
      <linearGradient id={`${prefix}-dual`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={base} />
        <stop offset="47%" stopColor={base} />
        <stop offset="49%" stopColor="#ffffff" />
        <stop offset="51%" stopColor="#ffffff" />
        <stop offset="53%" stopColor={second ?? base} />
        <stop offset="100%" stopColor={second ?? base} />
      </linearGradient>
      <linearGradient id={`${prefix}-dual-art`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={glow} />
        <stop offset="45%" stopColor={base} />
        <stop offset="100%" stopColor={second ?? base} />
      </linearGradient>
      <linearGradient id={`${prefix}-silver`} x1="0" y1="0" x2="1" y2="1">
        {stops(FOIL.silver)}
      </linearGradient>
      <linearGradient id={`${prefix}-gold`} x1="0" y1="0" x2="1" y2="1">
        {stops(FOIL.gold)}
      </linearGradient>
      <linearGradient id={`${prefix}-holo`} x1="0" y1="0" x2="1" y2="1">
        {stops(FOIL.holo)}
      </linearGradient>
      <linearGradient id={`${prefix}-holo2`} x1="1" y1="0" x2="0" y2="1">
        {stops([...FOIL.holo].reverse())}
      </linearGradient>
      <radialGradient id={`${prefix}-spot`} cx="0.5" cy="0.42" r="0.7">
        <stop offset="0%" stopColor={glow} />
        <stop offset="60%" stopColor={base} />
        <stop offset="100%" stopColor={base} />
      </radialGradient>
      <linearGradient id={`${prefix}-ink`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.34" />
      </linearGradient>
      {/* Habitat textures for the art zone: where the month's logging lived. */}
      <pattern id={`${prefix}-dots`} width="44" height="44" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="4" fill="#ffffff" />
        <circle cx="32" cy="30" r="2.5" fill="#ffffff" />
      </pattern>
      <pattern id={`${prefix}-grid`} width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M48 0H0V48" fill="none" stroke="#ffffff" strokeWidth="1.5" />
      </pattern>
      <pattern id={`${prefix}-stars`} width="90" height="90" patternUnits="userSpaceOnUse">
        <circle cx="12" cy="18" r="1.8" fill="#ffffff" />
        <circle cx="58" cy="10" r="1.2" fill="#ffffff" />
        <circle cx="76" cy="52" r="2.2" fill="#ffffff" />
        <circle cx="30" cy="70" r="1.4" fill="#ffffff" />
      </pattern>
    </defs>
  );
}

/** The paint for a card's frame at a given rarity (a dual type splits the plain frame). */
export function framePaint(prefix: string, rarity: Rarity, base: string, dual = false): string {
  switch (rarity) {
    case "common":
      return dual ? `url(#${prefix}-dual)` : base;
    case "uncommon":
      return dual ? `url(#${prefix}-dual)` : `url(#${prefix}-sheen)`;
    case "rare":
      return `url(#${prefix}-silver)`;
    case "epic":
      return `url(#${prefix}-holo)`;
    case "legendary":
      return `url(#${prefix}-gold)`;
  }
}
