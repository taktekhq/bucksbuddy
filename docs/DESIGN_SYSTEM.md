# BucksBuddy Design System

A small, reusable design language for an Apple-clean, iPhone-first PWA with a
playful Bugs Bunny ("What's up, Doc?") accent. Tokens live in
[`tailwind.config.ts`](../tailwind.config.ts) and [`src/index.css`](../src/index.css);
this doc explains the *what* and *when* so the look can be reused in new screens
or future projects.

## Brand & voice

- **Name / voice:** BucksBuddy — friendly, fast, a little cheeky. Use "What's up, Doc?"
  as the home greeting. Keep copy short and human ("Nothing yet. Tap + to record your first one.").
- **Personality:** Apple-neutral base (white surfaces, system grays) with a single
  playful **carrot** accent used sparingly — links, the logo 🥕, the "Cancel/Done"
  affordances. Never use carrot for money values.
- **Emoji** carry category meaning (see `lib/categories.ts`); don't invent new ones ad hoc.

## Color tokens

Defined as Tailwind colors. Light-first; dark mode is future work.

| Token | Value | Use |
|---|---|---|
| `surface` | `#FFFFFF` | App background, cards-on-white, primary screens |
| `grouped` | `#F2F2F7` | iOS systemGroupedBackground — inset cards, tiles, list rows, inactive segments |
| `label` | `#000000` | Primary text; also the primary button / selected-tile fill |
| `label-secondary` | `rgba(60,60,67,0.6)` | Secondary text, captions, placeholders |
| `separator` | `rgba(60,60,67,0.29)` | Hairline dividers; disabled button fill |
| `income` | `#34C759` (iOS systemGreen) | Money **in** / net positive **only** |
| `expense` | `#FF3B30` (iOS systemRed) | Money **out** / net negative **only** |
| `carrot` | `#FF7A00` | Playful brand accent — links, logo. Never on money values. |

**Rule:** all money sign + color comes from `lib/money.ts` (`netColorClass`,
`formatSignedUsdCents`) — never hand-pick green/red in a component.

## Typography

System font stack (`-apple-system, "SF Pro"…`) set in `src/index.css`.

| Role | Classes | Notes |
|---|---|---|
| Net total (display) | `text-6xl font-semibold tracking-tight tabular-nums` | The hero number on Home |
| Amount entry | `text-5xl font-semibold tracking-tight tabular-nums` | Numpad display |
| Title / nav | `text-base font-semibold` | Screen headers |
| Body | base (16px) | **Min 16px on any `<input>`** or iOS auto-zooms |
| Caption / secondary | `text-sm` / `text-xs` + `text-label-secondary` | Dates, hints |

Always use `tabular-nums` for money so digits don't jitter.

## Spacing & layout

- **Grid:** 4pt base (Tailwind default scale).
- **Screen gutter:** `px-5`; content capped at `max-w-md` and centered for large screens.
- **Safe areas:** `viewport-fit=cover` + `env(safe-area-inset-*)`, exposed as the
  `--safe-top`/`--safe-bottom` CSS vars and `safe-top`/`safe-bottom` spacing tokens.
  Bottom controls (Save, numpad, floating +) must clear the home indicator, e.g.
  `pb-[calc(1.5rem+var(--safe-bottom))]`.
- **Touch targets:** minimum 44×44pt. Numpad keys and tiles use generous `py-4`.

## Radii, shadows, surfaces

- `rounded-card` = **20px** for cards, tiles, numpad keys, primary buttons.
- `rounded-pill` for segmented controls and currency toggles.
- `shadow-card` = soft, subtle elevation for the selected segment, floating + button,
  and raised pills. Prefer hairline `border-separator` over heavy shadows inside lists.

## Core components

Each lives in `components/ui/`. States: **default → active/selected → pressed → disabled**.

- **InOutToggle** — pill segmented control. Out (left, default, `text-expense` when active)
  / In (right, `text-income` when active). Active segment = white fill + `shadow-card`.
- **CategoryGrid** — 3-col tiles (emoji + label). Selected = `bg-label text-white`;
  unselected = `bg-grouped`.
- **CurrencyToggle** — small USD/LBP pill, same active treatment as the segmented control.
- **AmountDisplay** — large centered amount; shows `≈ $x.xx` USD equivalent when in LBP.
- **Numpad** — digits + `.` + `⌫`. **No `<input>`** — emits keys; parent holds a string.
  Use the `applyKey` helper for the digit/decimal rules (single dot, max 2 decimals).
- **NetTotal** — hero number, green/red via `netColorClass`, signed via `formatSignedUsdCents`.
- **Primary button** — `rounded-card bg-label text-white`; disabled → `bg-separator`.

## Motion

- **Press feedback:** the `.press` utility (`src/index.css`) — `scale(0.96)` + subtle
  color/opacity transition on `:active`. Apply to every tappable tile/key/button.
- **Entrance:** `.animate-pop` (scale-in) for confirmations / newly shown elements.
- **Haptics:** progressive enhancement only — `navigator.vibrate(8)` on numpad keys
  (Android). iOS Safari ignores it; never block the flow on haptics.

## Reuse guide

1. Consume tokens via Tailwind classes (`bg-grouped`, `text-income`, `rounded-card`,
   `shadow-card`, `pb-[calc(...+var(--safe-bottom))]`) — don't hardcode hex or px.
2. Money formatting/coloring → always `lib/money.ts`. Currency math → `lib/currency.ts`.
3. New tappable elements get the `.press` class and a ≥44pt target.
4. New screens follow the shell pattern: `mx-auto max-w-md`, `px-5`, safe-area padding
   top and bottom, optional sticky/floating primary action.
5. Keep the palette to base + one accent (carrot). Resist adding new accent colors.
