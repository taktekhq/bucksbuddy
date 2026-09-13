// The story: the same month as a 9:16 poster for an Instagram or WhatsApp
// status. Where the card is a collectible, this is the recap — the title on
// its plate, the other titles the month earned as stamps, where the month
// went as a leaderboard, the logging stats, the flavor line, and (for the
// month still running) what's still in reach. Same rules as the card: one
// SVG for preview and export, every position from the glyph tables.
import { forwardRef } from "react";
import { formatCents } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import { rarityLabel, rarityStars } from "@/lib/recap";
import { fitSingleLine, fitText, textWidth } from "@/lib/recapText";
import type { RecapView } from "@/lib/recapView";
import { CarrotMark } from "./CarrotMark";
import { cardPalette } from "./palette";
import { FoilDefs, framePaint, RarityStars, Sparkle, T } from "./svg";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const PAD = 72;
const INNER_W = STORY_WIDTH - PAD * 2;
const GROBOLD_INK = "#48484A";
const ID = "story";
const HEADER_BOTTOM = 190;
const FOOTER_TOP = STORY_HEIGHT - 150;

export const RecapStory = forwardRef<SVGSVGElement, { view: RecapView }>(
  function RecapStory({ view }, ref) {
    const { facts, rarity, lead, second, moves, rest, title, caption, name, showAmounts, currency } =
      view;
    const p = cardPalette(lead.color);
    const rows = rest ? [...moves, rest] : moves;

    // Measure every block first, then stack them and center the stack in
    // the space between header and footer — a quiet month with two rows and
    // no caption sits in the middle instead of leaving the bottom half bare.
    const kicker = name ? `${name.toUpperCase()}, YOUR MONTH WAS` : "MY MONTH WAS";
    const kickerSize = fitSingleLine(kicker, "nunito900", INNER_W - 80, 24, 3);
    const titleFit = fitText(title.title, "grobold", {
      maxWidth: INNER_W - 80,
      maxLines: 3,
      maxSize: 112,
      minSize: 56,
    });
    const titleLineH = titleFit.size * 0.98;
    const plateH = 170 + titleFit.lines.length * titleLineH;

    const stamps = view.stamps.map((label) => ({
      label,
      w: textWidth(label, "nunito900", 18, 2) + 44,
    }));
    const stampsH = stamps.length ? 52 : 0;

    const ROW_H = 112;
    const boardH = 68 + rows.length * ROW_H;

    const tiles: { value: string; label: string }[] = [
      { value: String(facts.entries), label: "ENTRIES LOGGED" },
      { value: `${facts.daysLogged}/${facts.daysInMonth}`, label: "DAYS LOGGED" },
      { value: String(facts.streak), label: "DAY STREAK" },
      showAmounts
        ? { value: formatCents(facts.totalCents, currency), label: "TOTAL LOGGED" }
        : { value: String(facts.categories.length), label: "CATEGORIES" },
    ];
    const tileW = (INNER_W - 20) / 2;
    const tileH = 122;
    const statsH = tileH * 2 + 20;

    const captionFit =
      caption === null
        ? null
        : fitText(caption, "nunito700", {
            maxWidth: INNER_W - 40,
            maxLines: 3,
            maxSize: 38,
            minSize: 26,
          });
    const captionH = captionFit ? captionFit.lines.length * captionFit.size * 1.3 : 0;

    // The reveal line: one true thing about the month, under the numbers.
    const revealFit = fitText(view.reveal, "nunito900", {
      maxWidth: INNER_W - 40,
      maxLines: 2,
      maxSize: 30,
      minSize: 22,
    });
    const revealH = revealFit.lines.length * revealFit.size * 1.3;

    const nextUp = view.nextUp
      ? `LOG ${view.nextUp.days} MORE ${view.nextUp.days === 1 ? "DAY" : "DAYS"} FOR ${rarityLabel(view.nextUp.rarity).toUpperCase()}`
      : null;
    const nextUpH = nextUp ? 56 : 0;

    const GAP = 40;
    const blocks = [plateH, stampsH, boardH, statsH, revealH, captionH, nextUpH].filter(
      (h) => h > 0,
    );
    const total = blocks.reduce((sum, h) => sum + h, 0) + GAP * (blocks.length - 1);
    let y = HEADER_BOTTOM + Math.max(0, (FOOTER_TOP - HEADER_BOTTOM - total) / 2);
    const plate = { y, h: plateH };
    y += plateH + GAP;
    const stampsY = y;
    if (stampsH) y += stampsH + GAP;
    const board = { y, h: boardH };
    y += boardH + GAP;
    const stats = { y, h: statsH };
    y += statsH + GAP;
    const revealY = y;
    y += revealH + GAP;
    const captionY = y;
    if (captionH) y += captionH + GAP;
    const nextUpY = y;

    const stars = rarityStars(rarity);
    const holo = rarity === "epic" || rarity === "legendary";

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`}
        role="img"
        aria-label={`${title.title} ${rarityLabel(rarity)} story for ${monthLabel(facts.month)}`}
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <FoilDefs prefix={ID} base={p.base} glow={p.glow} second={second?.color} />
        <defs>
          <linearGradient id={`${ID}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.glow} />
            <stop offset="45%" stopColor={p.base} />
            <stop offset="100%" stopColor={second ? cardPalette(second.color).ink : p.ink} />
          </linearGradient>
        </defs>

        {/* Ground: the type's color, top-lit (a dual type fades into its second). */}
        <rect width={STORY_WIDTH} height={STORY_HEIGHT} fill={`url(#${ID}-bg)`} />
        {holo && (
          <rect width={STORY_WIDTH} height={STORY_HEIGHT} fill={`url(#${ID}-holo)`} opacity={0.16} />
        )}
        {[0.42, 0.56, 0.7].map((f, i) => (
          <circle
            key={i}
            cx={STORY_WIDTH / 2}
            cy={plate.y + plate.h / 2}
            r={INNER_W * f}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.16 - i * 0.04}
            strokeWidth={2}
          />
        ))}
        {view.sparkles.map((s, i) => (
          <Sparkle
            key={i}
            x={PAD + s.x * INNER_W}
            y={120 + s.y * 700}
            r={30 * s.r}
            rotate={s.rotate}
          />
        ))}

        {/* Header: the brand on its own small plate (Grobold stays grey on
            white, even here), and the month. */}
        <rect x={PAD} y={72} width={196} height={84} rx={42} fill="#ffffff" opacity={0.94} />
        <CarrotMark x={PAD + 16} y={86} size={56} />
        <T x={PAD + 82} y={108} font="grobold" size={24} fill={GROBOLD_INK}>
          BUCKS
        </T>
        <T x={PAD + 82} y={134} font="grobold" size={24} fill={GROBOLD_INK}>
          BUDDY
        </T>
        <T x={STORY_WIDTH - PAD} y={118} font="nunito900" size={24} fill="#ffffff" anchor="end" spacing={3}>
          {monthLabel(facts.month).toUpperCase()}
        </T>
        {facts.current && (
          <T x={STORY_WIDTH - PAD} y={150} font="nunito900" size={17} fill="#ffffff" anchor="end" spacing={3} opacity={0.8}>
            MONTH SO FAR
          </T>
        )}

        {/* The plate: kicker, title, rarity. */}
        <rect x={PAD} y={plate.y} width={INNER_W} height={plate.h} rx={40} fill="#ffffff" />
        {rarity !== "common" && (
          <rect
            x={PAD}
            y={plate.y}
            width={INNER_W}
            height={plate.h}
            rx={40}
            fill={framePaint(ID, rarity, p.base)}
            opacity={rarity === "uncommon" ? 0.12 : 0.2}
          />
        )}
        <T x={PAD + 40} y={plate.y + 62} font="nunito900" size={kickerSize} fill={p.ink} spacing={3} opacity={0.75}>
          {kicker}
        </T>
        {titleFit.lines.map((line, i) => (
          <T
            key={i}
            x={PAD + 40}
            y={plate.y + 84 + titleLineH * (i + 1)}
            font="grobold"
            size={titleFit.size}
            fill={GROBOLD_INK}
          >
            {line}
          </T>
        ))}
        <RarityStars x={PAD + 40} y={plate.y + plate.h - 50} count={stars} size={13} gap={10} fill={rarity === "legendary" ? "#d99a1e" : p.ink} />
        <T x={PAD + 40 + 5 * 36 + 8} y={plate.y + plate.h - 43} font="nunito900" size={18} fill={p.ink} spacing={3} opacity={0.75}>
          {`${rarityLabel(rarity).toUpperCase()} · ${[lead, ...(second ? [second] : [])]
            .map((m) => m.label.toUpperCase())
            .join(" / ")} TYPE`}
        </T>

        {/* Stamps: the other titles this month earned. */}
        {stamps.map((stamp, i) => {
          const x = PAD + stamps.slice(0, i).reduce((sum, s) => sum + s.w + 14, 0);
          return (
            <g key={stamp.label}>
              <rect x={x} y={stampsY} width={stamp.w} height={52} rx={26} fill="#ffffff" opacity={0.92} />
              <T x={x + stamp.w / 2} y={stampsY + 33} font="nunito900" size={18} fill={p.ink} anchor="middle" spacing={2}>
                {stamp.label}
              </T>
            </g>
          );
        })}

        {/* Where it went. */}
        <T x={PAD} y={board.y + 30} font="nunito900" size={20} fill="#ffffff" spacing={4} opacity={0.85}>
          WHERE IT WENT
        </T>
        {rows.map((row, i) => {
          const rowY = board.y + 68 + i * ROW_H;
          const isRest = row.id === rest?.id;
          const move = moves.find((m) => m.id === row.id);
          const Icon = move?.icon;
          const label = [row.label, ...(showAmounts ? [formatCents(row.cents, currency)] : [])].join(" · ");
          const labelSize = fitSingleLine(label, "nunito900", INNER_W - 90 - 190, 36);
          return (
            <g key={row.id}>
              <circle cx={PAD + 34} cy={rowY + 34} r={32} fill="#ffffff" opacity={isRest ? 0.18 : 0.94} />
              {Icon ? (
                <Icon x={PAD + 34 - 17} y={rowY + 34 - 17} size={34} color={move!.color} strokeWidth={2.2} />
              ) : (
                <T x={PAD + 34} y={rowY + 44} font="nunito900" size={28} fill="#ffffff" anchor="middle">
                  …
                </T>
              )}
              <T x={PAD + 90} y={rowY + 46} font="nunito900" size={labelSize} fill="#ffffff">
                {label}
              </T>
              <T x={STORY_WIDTH - PAD - 26} y={rowY + 48} font="nunito900" size={48} fill="#ffffff" anchor="end">
                {row.percent}
              </T>
              <T x={STORY_WIDTH - PAD - 22} y={rowY + 48} font="nunito900" size={22} fill="#ffffff" opacity={0.75}>
                %
              </T>
              <rect x={PAD + 90} y={rowY + 66} width={INNER_W - 90} height={12} rx={6} fill="#ffffff" opacity={0.22} />
              <rect
                x={PAD + 90}
                y={rowY + 66}
                width={Math.max(12, (INNER_W - 90) * row.share)}
                height={12}
                rx={6}
                fill="#ffffff"
                opacity={isRest ? 0.55 : 0.95}
              />
            </g>
          );
        })}

        {/* Stats, two by two. */}
        {tiles.map((tile, i) => {
          const x = PAD + (i % 2) * (tileW + 20);
          const tileY = stats.y + Math.floor(i / 2) * (tileH + 20);
          const valueSize = fitSingleLine(tile.value, "nunito900", tileW - 48, 54);
          return (
            <g key={tile.label}>
              <rect x={x} y={tileY} width={tileW} height={tileH} rx={28} fill="#ffffff" opacity={0.16} />
              <T x={x + tileW / 2} y={tileY + 66} font="nunito900" size={valueSize} fill="#ffffff" anchor="middle">
                {tile.value}
              </T>
              <T x={x + tileW / 2} y={tileY + tileH - 26} font="nunito900" size={15} fill="#ffffff" anchor="middle" spacing={3} opacity={0.8}>
                {tile.label}
              </T>
            </g>
          );
        })}

        {/* The reveal line. */}
        {revealFit.lines.map((line, i) => (
          <T
            key={i}
            x={STORY_WIDTH / 2}
            y={revealY + revealFit.size + i * revealFit.size * 1.3}
            font="nunito900"
            size={revealFit.size}
            fill="#ffffff"
            anchor="middle"
          >
            {line}
          </T>
        ))}

        {/* The flavor line. */}
        {captionFit &&
          captionFit.lines.map((line, i) => (
            <T
              key={i}
              x={STORY_WIDTH / 2}
              y={captionY + captionFit.size + i * captionFit.size * 1.3}
              font="nunito700"
              size={captionFit.size}
              fill="#ffffff"
              anchor="middle"
              opacity={0.85}
            >
              {line}
            </T>
          ))}

        {/* What's still in reach this month. */}
        {nextUp && (
          <g>
            <rect
              x={STORY_WIDTH / 2 - (textWidth(nextUp, "nunito900", 18, 3) + 64) / 2}
              y={nextUpY}
              width={textWidth(nextUp, "nunito900", 18, 3) + 64}
              height={56}
              rx={28}
              fill="#ffffff"
              opacity={0.16}
            />
            <T x={STORY_WIDTH / 2} y={nextUpY + 35} font="nunito900" size={18} fill="#ffffff" anchor="middle" spacing={3}>
              {nextUp}
            </T>
          </g>
        )}

        {/* Footer. */}
        <line x1={PAD} x2={STORY_WIDTH - PAD} y1={FOOTER_TOP + 8} y2={FOOTER_TOP + 8} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2} />
        <T x={PAD} y={FOOTER_TOP + 58} font="nunito900" size={26} fill="#ffffff">
          bucksbuddy.com
        </T>
        <T x={STORY_WIDTH - PAD} y={FOOTER_TOP + 58} font="nunito900" size={18} fill="#ffffff" anchor="end" spacing={3} opacity={0.8}>
          LOG IT. COLLECT IT.
        </T>
      </svg>
    );
  },
);
