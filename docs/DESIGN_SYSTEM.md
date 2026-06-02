# BucksBuddy Design System

A minimal black-and-white design language with a single playful **carrot orange**
accent. Apple-clean spacing, big numbers, generous touch targets, zero color
noise — color shows up only where the brand has a job to do (primary action,
selected state, link affordances). Tokens live in
[`tailwind.config.ts`](../tailwind.config.ts) and [`src/index.css`](../src/index.css);
this doc explains the *what* and *when* so the look can be reused in new screens
or future projects.

## Brand & voice

- **Name / voice:** BucksBuddy — friendly, fast, a little cheeky. Use "What's up, Doc?"
  as the home greeting. Keep copy short and human ("Nothing yet. Tap + to record your first one.").
- **Personality:** **Pure monochrome** (white surfaces, black text, gray inactive
  states) with **one** brand accent — **carrot orange** — applied sparingly to the
  things the user is *meant* to act on: the Save / Update button, the selected
  category tile, the Edit swipe action, and inline action links ("Cancel edit",
  "Done"). Nothing else gets color.
- **Icons:** [`lucide-react`](https://lucide.dev/) everywhere — settings chrome,
  category tiles, transaction rows. Stroke 1.75, sized 5–7 in tile contexts,
  4 inline. Don't mix emoji with lucide; pick one per surface (we picked lucide).
- **Money is monochrome.** Direction comes from the sign (`+` / `-`), not from
  green/red. Never tint money values.

## Color tokens

Defined as Tailwind colors. Light-first; dark mode is future work.

| Token | Value | Use |
|---|---|---|
| `surface` | `#FFFFFF` | App background, cards, primary screens |
| `grouped` | `#F2F2F2` | Inactive tiles, numpad keys, toggle tracks, inline pill backgrounds |
| `label` | `#000000` | Primary text, money values, icons, settings chrome |
| `label-secondary` | `#8E8E93` | Captions, dates, placeholders, sub-labels |
| `separator` | `rgba(0,0,0,0.08)` | Disabled button fill; use sparingly — prefer spacing over hairlines |
| `income` | `#000000` | Defined as black; sign carries direction, never tint money |
| `expense` | `#000000` | Same as `income`; tokens kept for semantic call-sites |
| `carrot` | `#FF7A00` | **The** brand accent. Primary button fill, selected tile, Edit-swipe panel, inline action links |
| `danger` | `#FF3B30` | Real errors only (form validation, auth failures). Never for money. |

**Rules:**

- Money sign + color always come from `lib/money.ts` (`netColorClass`,
  `formatSignedUsdCents`). `netColorClass` returns `text-label` — monochrome —
  for every value. Don't hand-pick green/red.
- Carrot is the only chromatic color in the chrome. If you find yourself reaching
  for a second hue, push back — there isn't one.
- `danger` is for *errors*, not for destructive actions. Destructive actions
  (Delete swipe, Sign out) render in black on white or white on black, not red.

## Typography

System font stack (`-apple-system, "SF Pro"…`) set in `src/index.css`.

| Role | Classes | Notes |
|---|---|---|
| Net total (display) | `text-4xl` (compact) / `text-6xl` (hero) `font-semibold tracking-tight tabular-nums` | The hero number on Home |
| Amount entry | `text-4xl font-semibold tracking-tight tabular-nums` | Numpad display |
| Title / nav | `text-base font-semibold` | Screen headers |
| Body | base (16px) | **Min 16px on any `<input>`** or iOS auto-zooms |
| Caption / secondary | `text-sm` / `text-xs` + `text-label-secondary` | Dates, hints |

Always use `tabular-nums` for money so digits don't jitter.

## Spacing & layout

- **Grid:** 4pt base (Tailwind default scale).
- **Screen gutter:** `px-5`; content capped at `max-w-md` and centered for large screens.
- **Safe areas:** `viewport-fit=cover` + `env(safe-area-inset-*)`, exposed as the
  `--safe-top`/`--safe-bottom` CSS vars and `safe-top`/`safe-bottom` spacing tokens.
  Bottom controls must clear the home indicator, e.g.
  `pb-[calc(2rem+var(--safe-bottom))]`.
- **Touch targets:** minimum 44×44pt. Numpad keys (`py-4`) and category tiles
  (`py-5`) use generous padding.
- **Separators:** *avoid hairline dividers between sections.* Separate by
  whitespace and natural rounding instead. The previous iOS-style hairlines
  inside the composer were removed for this reason.

## Radii, shadows, surfaces

- `rounded-card` = **20px** for tiles, numpad keys, swipe-row containers.
- `rounded-pill` for segmented controls, currency toggles, and the primary
  Save / Update button.
- `shadow-card` — soft, subtle elevation reserved for the *active segment* in
  pill toggles (so it lifts off the gray track). Don't put shadows on
  full-width cards — they look heavy on a white page.

## Core components

Each lives in `components/ui/`. States: **default → active/selected → pressed → disabled**.

- **InOutToggle** — pill segmented control on a `bg-grouped` track. Active
  segment = `bg-white text-label shadow-card`; inactive = `text-label-secondary`.
  Monochrome on both sides — no green/red.
- **CategoryGrid** — 3-col tiles (lucide icon + label). Selected =
  `bg-carrot text-white`; unselected = `bg-grouped text-label`. Icon stroke 1.75,
  sized `h-7 w-7`.
- **CurrencyToggle** — small USD/LBP pill, same active treatment as InOutToggle.
- **AmountDisplay** — large centered amount; shows `≈ $x.xx` USD equivalent when
  in LBP.
- **Numpad** — digits + `.` + `⌫`. **No `<input>`** — emits keys; parent holds
  a string. Use the `applyKey` helper for the digit/decimal rules (single dot,
  max 2 decimals).
- **NetTotal** — hero number; **monochrome** (`text-label`). Sign carries
  direction (`-$12.50` for negative, `$87.50` for non-negative). Subtitle reads
  "net this month".
- **HistoryList row** — lucide category icon in a `bg-grouped` round chip + label
  + date + signed monochrome amount. Rows are spaced with `gap-1.5` — *no*
  divide-y hairlines. Swipe reveals: **Edit = carrot panel** (primary action);
  **Delete = black panel** (destructive). Drag uses `framer-motion` with spring
  snap and rubber-band overscroll (`stiffness: 500, damping: 40`).
- **Primary button** — `rounded-pill bg-carrot text-white px-10 py-3 font-semibold`.
  Disabled → `bg-separator`. Centered; *do not* stretch full-width — a compact
  pill keeps the brand accent feeling deliberate.
- **Action link** — inline `text-carrot` for "Cancel edit", "Done", etc. No
  underline.

## Motion

- **Press feedback:** the `.press` utility (`src/index.css`) — `scale(0.96)` +
  subtle color/opacity transition on `:active`. Apply to every tappable
  tile/key/button.
- **Entrance:** `.animate-pop` (scale-in) for confirmations / newly shown elements.
- **Drag (history rows):** `framer-motion` `drag="x"` with `dragElastic: 0.18`,
  spring snap (`stiffness: 500, damping: 40`), velocity-aware commit. Don't
  hand-roll touch handlers — let framer do physics.
- **Haptics:** progressive enhancement only — `navigator.vibrate(8)` on numpad
  keys (Android). iOS Safari ignores it; never block the flow on haptics.

## Reuse guide

1. Consume tokens via Tailwind classes (`bg-grouped`, `text-label`,
   `rounded-card`, `bg-carrot`, `pb-[calc(...+var(--safe-bottom))]`) — don't
   hardcode hex or px.
2. Money formatting → always `lib/money.ts`. Currency math → `lib/currency.ts`.
3. New tappable elements get the `.press` class and a ≥44pt target.
4. New screens follow the shell pattern: `mx-auto max-w-md`, `px-5`, safe-area
   padding top and bottom, optional sticky/floating primary action.
5. **Keep the palette to monochrome + carrot.** If you reach for a second hue,
   ask: is this a *real error*? (Then use `danger`.) Otherwise it's monochrome
   or carrot — those are the only choices.
