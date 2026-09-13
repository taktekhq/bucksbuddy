// The trading card: a 5:7 collectible for one month of logging. One SVG that
// is both the on-screen preview (scaled by CSS) and, serialized, the exported
// PNG — so what you see is exactly what gets shared. Every position is
// computed here from the glyph tables in lib/recapText; nothing depends on
// the browser having measured anything.
//
// Anatomy, top to bottom: the header band (brand mark, edition), the name
// plate (title, days logged), the art zone (the type's icon and share, the
// month's habitat and glints), the top categories, the stat row, the flavor
// line and the footer. The leading category is the card's "type" and sets
// its whole palette; the rarity — earned by days logged — decides the
// frame's foil and the glints. Grobold stays the wordmark's grey on white,
// as everywhere else in the app.
import { forwardRef } from "react";
import {
  Briefcase,
  CalendarDays,
  Clock,
  Flame,
  Globe,
  Moon,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatCents } from "@/lib/money";
import { editionLabel, rarityLabel, rarityStars } from "@/lib/recap";
import { fitSingleLine, fitText, textWidth } from "@/lib/recapText";
import { HABITAT_LABEL, type Habitat } from "@/lib/recapTitles";
import type { RecapView } from "@/lib/recapView";
import { CarrotMark } from "./CarrotMark";
import { cardPalette, flameColor } from "./palette";
import { FoilDefs, framePaint, RarityStars, Sparkle, T } from "./svg";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1512;

const FRAME = 22; // the foil band
const PAD = 60; // content inset from the card edge
const INNER_W = CARD_WIDTH - PAD * 2;
const CARROT = "#F56300";
const GROBOLD_INK = "#48484A";
const ID = "card";

const HABITAT_ICON: Record<Habitat, LucideIcon> = {
  weekends: CalendarDays,
  weekdays: Briefcase,
  night: Moon,
  sunrise: Sunrise,
  anytime: Clock,
};

// The habitat's texture over the art zone; sunrise draws rays instead, and
// "anytime" has none.
const HABITAT_TEXTURE: Partial<Record<Habitat, string>> = {
  weekends: `url(#${ID}-dots)`,
  weekdays: `url(#${ID}-grid)`,
  night: `url(#${ID}-stars)`,
};

// Zones are laid out from the bottom up: the footer, then the (optional)
// flavor line, the stats and the category rows above it, and the art zone
// takes whatever is left under the name plate — so a month with only one
// category, or the caption turned off, gets a bigger picture rather than a
// hole where something used to be.
function zones(rows: number, hasCaption: boolean) {
  const footer = { y: CARD_HEIGHT - 96, h: 54 };
  const caption = hasCaption ? { y: footer.y - 24 - 96, h: 96 } : null;
  const stats = { y: (caption ? caption.y : footer.y) - 24 - 116, h: 116 };
  const movesH = 32 + rows * 84;
  const moves = { y: stats.y - 24 - movesH, h: movesH };
  const plate = { y: 158, h: 140 };
  const art = { y: plate.y + plate.h + 24, h: moves.y - 24 - (plate.y + plate.h + 24) };
  return { footer, caption, stats, moves, plate, art };
}

type Tile = { value: string; label: string; icon?: LucideIcon; color?: string };

export const RecapCard = forwardRef<SVGSVGElement, { view: RecapView }>(
  function RecapCard({ view }, ref) {
    const { facts, rarity, lead, second, moves, title, caption, name, showAmounts, currency } =
      view;
    const p = cardPalette(lead.color);
    const z = zones(moves.length, caption !== null);
    const Icon = lead.icon;
    const dual = second !== null;

    // The name plate: the title fitted to two lines beside the days block.
    const daysW = 200;
    const titleFit = fitText(title.title, "grobold", {
      maxWidth: INNER_W - 40 - daysW,
      maxLines: 2,
      maxSize: 64,
      minSize: 36,
    });
    const titleLineH = titleFit.size * 0.98;
    const titleTop = z.plate.y + (z.plate.h - titleFit.lines.length * titleLineH) / 2;

    // The art zone: the type's icon over a spotlight, the share as the hero
    // number in the corner, and the month's glints.
    const artX = PAD;
    const artW = INNER_W;
    const iconSize = Math.min(340, Math.round(z.art.h * 0.52));
    const iconY = z.art.y + z.art.h * 0.4 - iconSize / 2;
    const percentText = `${lead.percent}%`;
    const percentSize = fitSingleLine(percentText, "nunito900", 380, 150);
    const percentY = z.art.y + z.art.h - 44;
    const percentW = textWidth(percentText, "nunito900", percentSize);
    const typeLabel = `TYPE · ${[lead, ...(second ? [second] : [])]
      .map((m) => m.label.toUpperCase())
      .join(" / ")}`;
    const region = facts.currencies >= 2 ? `${facts.currencies} CURRENCIES` : null;
    const regionW = region ? textWidth(region, "nunito900", 17, 2) + 76 : 0;
    const texture = HABITAT_TEXTURE[view.habitat];

    // The stat row: streak, spectrum, habitat, entries — and the month's
    // total when amounts are on.
    const tiles: Tile[] = [
      {
        value: String(facts.streak),
        label: "DAY STREAK",
        icon: Flame,
        color: flameColor(facts.streak),
      },
      { value: `${facts.categories.length}/${EXPENSE_CATEGORIES.length}`, label: "SPECTRUM" },
      {
        value: HABITAT_LABEL[view.habitat],
        label: "HABITAT",
        icon: HABITAT_ICON[view.habitat],
        color: p.ink,
      },
      { value: String(facts.entries), label: "ENTRIES" },
      ...(showAmounts
        ? [{ value: formatCents(facts.totalCents, currency), label: "TOTAL OUT" }]
        : []),
    ];
    const tileW = INNER_W / tiles.length;

    const captionFit =
      caption === null
        ? null
        : fitText(caption, "nunito700", {
            maxWidth: INNER_W - 40,
            maxLines: 2,
            maxSize: 28,
            minSize: 20,
          });

    const collection = name ? `${name.toUpperCase()}'S COLLECTION` : "MY COLLECTION";
    const collectionSize = fitSingleLine(collection, "nunito900", 372, 19, 2);
    const edition = editionLabel(facts.month);
    const stars = rarityStars(rarity);
    const holo = rarity === "epic" || rarity === "legendary";

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        role="img"
        aria-label={`${title.title} ${rarityLabel(rarity)} card for ${edition}`}
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <FoilDefs prefix={ID} base={p.base} glow={p.glow} second={second?.color} />
        <defs>
          <clipPath id={`${ID}-art-clip`}>
            <rect x={artX} y={z.art.y} width={artW} height={z.art.h} rx={30} />
          </clipPath>
          <clipPath id={`${ID}-card-clip`}>
            <rect width={CARD_WIDTH} height={CARD_HEIGHT} rx={48} />
          </clipPath>
        </defs>

        {/* Frame and paper. The frame wears the rarity's foil. */}
        <rect
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          rx={48}
          fill={framePaint(ID, rarity, p.base, dual)}
        />
        <rect
          x={FRAME}
          y={FRAME}
          width={CARD_WIDTH - FRAME * 2}
          height={CARD_HEIGHT - FRAME * 2}
          rx={32}
          fill={p.ground}
        />
        {rarity === "legendary" && (
          <rect
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            rx={48}
            fill={`url(#${ID}-holo2)`}
            opacity={0.12}
            clipPath={`url(#${ID}-card-clip)`}
          />
        )}

        {/* Header band: the brand mark and the edition. */}
        <CarrotMark x={PAD} y={56} size={56} />
        <T x={PAD + 66} y={82} font="grobold" size={22} fill={GROBOLD_INK}>
          BUCKS
        </T>
        <T x={PAD + 66} y={106} font="grobold" size={22} fill={GROBOLD_INK}>
          BUDDY
        </T>
        <rect x={CARD_WIDTH - PAD - 176} y={58} width={176} height={40} rx={20} fill={p.ink} />
        <T x={CARD_WIDTH - PAD - 88} y={86} font="nunito900" size={20} fill="#ffffff" anchor="middle" spacing={2}>
          {edition}
        </T>
        {facts.current && (
          <T x={CARD_WIDTH - PAD} y={126} font="nunito900" size={15} fill={p.ink} anchor="end" spacing={2} opacity={0.7}>
            MONTH SO FAR
          </T>
        )}

        {/* Name plate: the title, and the days logged — the number that
            decides the rarity — at the right. */}
        <rect x={PAD} y={z.plate.y} width={INNER_W} height={z.plate.h} rx={28} fill="#ffffff" />
        {rarity !== "common" && (
          <rect
            x={PAD}
            y={z.plate.y}
            width={INNER_W}
            height={z.plate.h}
            rx={28}
            fill={framePaint(ID, rarity, p.base)}
            opacity={rarity === "uncommon" ? 0.12 : 0.22}
          />
        )}
        {titleFit.lines.map((line, i) => (
          <T
            key={i}
            x={PAD + 32}
            y={titleTop + titleLineH * (i + 1) - titleFit.size * 0.18}
            font="grobold"
            size={titleFit.size}
            fill={GROBOLD_INK}
          >
            {line}
          </T>
        ))}
        <T x={CARD_WIDTH - PAD - 28} y={z.plate.y + 78} font="nunito900" size={52} fill={p.ink} anchor="end">
          {`${facts.daysLogged}/${facts.daysInMonth}`}
        </T>
        <T x={CARD_WIDTH - PAD - 28} y={z.plate.y + 108} font="nunito900" size={15} fill={p.ink} anchor="end" spacing={2} opacity={0.65}>
          DAYS LOGGED
        </T>

        {/* Art zone. */}
        <g clipPath={`url(#${ID}-art-clip)`}>
          <rect
            x={artX}
            y={z.art.y}
            width={artW}
            height={z.art.h}
            fill={dual ? `url(#${ID}-dual-art)` : `url(#${ID}-spot)`}
          />
          {texture && (
            <rect x={artX} y={z.art.y} width={artW} height={z.art.h} fill={texture} opacity={0.14} />
          )}
          {view.habitat === "sunrise" &&
            Array.from({ length: 9 }, (_, i) => {
              const angle = Math.PI + (Math.PI * (i + 0.5)) / 9;
              return (
                <line
                  key={i}
                  x1={artX + artW / 2}
                  y1={z.art.y + z.art.h}
                  x2={artX + artW / 2 + Math.cos(angle) * artW}
                  y2={z.art.y + z.art.h + Math.sin(angle) * artW}
                  stroke="#ffffff"
                  strokeOpacity={0.12}
                  strokeWidth={22}
                />
              );
            })}
          {holo && (
            <rect x={artX} y={z.art.y} width={artW} height={z.art.h} fill={`url(#${ID}-holo)`} opacity={0.2} />
          )}
          {[0.26, 0.38, 0.5].map((f, i) => (
            <circle
              key={i}
              cx={artX + artW / 2}
              cy={z.art.y + z.art.h * 0.4}
              r={z.art.h * f}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.22 - i * 0.05}
              strokeWidth={2}
            />
          ))}
          <rect x={artX} y={z.art.y + z.art.h * 0.55} width={artW} height={z.art.h * 0.45} fill={`url(#${ID}-ink)`} />
          <Icon
            x={artX + artW / 2 - iconSize / 2}
            y={iconY}
            size={iconSize}
            color="#ffffff"
            strokeWidth={1.6}
          />
          {view.sparkles.map((s, i) => (
            <Sparkle
              key={i}
              x={artX + s.x * artW}
              y={z.art.y + s.y * z.art.h}
              r={26 * s.r}
              rotate={s.rotate}
            />
          ))}
          {/* The type chip. */}
          <rect
            x={artX + 24}
            y={z.art.y + 24}
            width={textWidth(typeLabel, "nunito900", 17, 2) + 44}
            height={40}
            rx={20}
            fill="#ffffff"
            opacity={0.92}
          />
          <T x={artX + 46} y={z.art.y + 51} font="nunito900" size={17} fill={p.ink} spacing={2}>
            {typeLabel}
          </T>
          {rarity === "legendary" && (
            <>
              <rect x={artX + artW - 24 - 196} y={z.art.y + 24} width={196} height={40} rx={20} fill={`url(#${ID}-gold)`} />
              <T x={artX + artW - 24 - 98} y={z.art.y + 51} font="nunito900" size={17} fill="#5a3d05" anchor="middle" spacing={2}>
                ★ LEGENDARY ★
              </T>
            </>
          )}
          {/* The region stamp: how many currencies the month was typed in. */}
          {region && (
            <g>
              <rect
                x={artX + artW - 24 - regionW}
                y={z.art.y + z.art.h - 64}
                width={regionW}
                height={40}
                rx={20}
                fill="#ffffff"
                opacity={0.92}
              />
              <Globe
                x={artX + artW - 24 - regionW + 18}
                y={z.art.y + z.art.h - 55}
                size={22}
                color={p.ink}
                strokeWidth={2.2}
              />
              <T x={artX + artW - 46} y={z.art.y + z.art.h - 37} font="nunito900" size={17} fill={p.ink} anchor="end" spacing={2}>
                {region}
              </T>
            </g>
          )}
          {/* The hero number: this type's share of the month. */}
          <T x={artX + 36} y={percentY} font="nunito900" size={percentSize} fill={p.ink} opacity={0.35}>
            {percentText}
          </T>
          <T x={artX + 30} y={percentY - 6} font="nunito900" size={percentSize} fill="#ffffff">
            {percentText}
          </T>
          <T x={artX + 30 + percentW + 22} y={percentY - 32} font="nunito900" size={17} fill="#ffffff" spacing={2}>
            OF LOGGED
          </T>
          <T x={artX + 30 + percentW + 22} y={percentY - 8} font="nunito900" size={17} fill="#ffffff" spacing={2}>
            SPENDING
          </T>
        </g>

        {/* The top categories, each with its share. */}
        <rect x={PAD} y={z.moves.y} width={INNER_W} height={z.moves.h} rx={28} fill="#ffffff" />
        {moves.map((m, i) => {
          const rowY = z.moves.y + 16 + i * 84;
          const MoveIcon = m.icon;
          const sub = [
            m.name,
            `${m.entries} ${m.entries === 1 ? "entry" : "entries"}`,
            ...(showAmounts ? [formatCents(m.cents, currency)] : []),
          ].join(" · ");
          const subSize = fitSingleLine(sub, "nunito700", 560, 17);
          return (
            <g key={m.id}>
              <circle cx={PAD + 52} cy={rowY + 36} r={26} fill={cardPalette(m.color).soft} />
              <MoveIcon x={PAD + 52 - 14} y={rowY + 36 - 14} size={28} color={m.color} strokeWidth={2.2} />
              <T x={PAD + 98} y={rowY + 32} font="nunito900" size={30} fill={p.ink}>
                {m.label}
              </T>
              <T x={PAD + 98} y={rowY + 56} font="nunito700" size={subSize} fill={p.ink} opacity={0.62}>
                {sub}
              </T>
              <rect x={PAD + 98} y={rowY + 66} width={INNER_W - 98 - 160} height={6} rx={3} fill={p.soft} />
              <rect
                x={PAD + 98}
                y={rowY + 66}
                width={Math.max(6, (INNER_W - 98 - 160) * m.share)}
                height={6}
                rx={3}
                fill={m.color}
              />
              <T x={CARD_WIDTH - PAD - 48} y={rowY + 46} font="nunito900" size={42} fill={p.ink} anchor="end">
                {m.percent}
              </T>
              <T x={CARD_WIDTH - PAD - 44} y={rowY + 46} font="nunito900" size={20} fill={p.ink} opacity={0.6}>
                %
              </T>
              {i > 0 && (
                <line x1={PAD + 98} x2={CARD_WIDTH - PAD - 28} y1={rowY - 6} y2={rowY - 6} stroke={p.soft} strokeWidth={1.5} />
              )}
            </g>
          );
        })}

        {/* Stat row. */}
        <rect x={PAD} y={z.stats.y} width={INNER_W} height={z.stats.h} rx={28} fill={p.soft} />
        {tiles.map((tile, i) => {
          const cx = PAD + tileW * i + tileW / 2;
          const TileIcon = tile.icon;
          const iconW = TileIcon ? 30 : 0;
          const valueSize = fitSingleLine(tile.value, "nunito900", tileW - 32 - iconW, 36);
          const valueW = textWidth(tile.value, "nunito900", valueSize);
          const left = cx - (valueW + iconW) / 2;
          return (
            <g key={tile.label}>
              {i > 0 && (
                <line x1={PAD + tileW * i} x2={PAD + tileW * i} y1={z.stats.y + 24} y2={z.stats.y + z.stats.h - 24} stroke={p.base} strokeOpacity={0.35} strokeWidth={1.5} />
              )}
              {TileIcon && (
                <TileIcon x={left} y={z.stats.y + 36} size={26} color={tile.color} strokeWidth={2.4} />
              )}
              <T x={left + iconW} y={z.stats.y + 58} font="nunito900" size={valueSize} fill={p.ink}>
                {tile.value}
              </T>
              {tile.label === "SPECTRUM" &&
                EXPENSE_CATEGORIES.map((c, slot) => (
                  <rect
                    key={c.id}
                    x={cx - (EXPENSE_CATEGORIES.length * 10) / 2 + slot * 10}
                    y={z.stats.y + 68}
                    width={8}
                    height={6}
                    rx={2}
                    fill={c.color}
                    opacity={facts.categories.some((b) => b.id === c.id) ? 1 : 0.15}
                  />
                ))}
              <T x={cx} y={z.stats.y + 96} font="nunito900" size={13} fill={p.ink} anchor="middle" spacing={2} opacity={0.65}>
                {tile.label}
              </T>
            </g>
          );
        })}

        {/* Flavor text. */}
        {captionFit &&
          z.caption &&
          captionFit.lines.map((line, i) => (
            <T
              key={i}
              x={CARD_WIDTH / 2}
              y={z.caption!.y + 30 + (captionFit.lines.length === 1 ? 22 : 0) + i * captionFit.size * 1.25}
              font="nunito700"
              size={captionFit.size}
              fill={p.ink}
              anchor="middle"
              opacity={0.85}
            >
              {line}
            </T>
          ))}

        {/* Footer band. */}
        <line x1={PAD} x2={CARD_WIDTH - PAD} y1={z.footer.y} y2={z.footer.y} stroke={p.base} strokeOpacity={0.4} strokeWidth={2} />
        <T x={PAD} y={z.footer.y + 38} font="nunito900" size={collectionSize} fill={p.ink} spacing={2}>
          {collection}
        </T>
        <RarityStars x={CARD_WIDTH / 2 - 78} y={z.footer.y + 31} count={stars} size={11} gap={10} fill={rarity === "legendary" ? "#d99a1e" : p.ink} />
        <T x={CARD_WIDTH / 2} y={z.footer.y + 68} font="nunito900" size={13} fill={p.ink} anchor="middle" spacing={3} opacity={0.65}>
          {rarityLabel(rarity).toUpperCase()}
        </T>
        <T x={CARD_WIDTH - PAD} y={z.footer.y + 38} font="nunito900" size={20} fill={CARROT} anchor="end">
          bucksbuddy.com
        </T>
      </svg>
    );
  },
);
