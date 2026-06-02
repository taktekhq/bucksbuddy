# BucksBuddy Design System

**An Apple app, hijacked by Bugs Bunny.**

The base is a plain, grouped-iOS experience: a soft gray canvas, white cards with
light elevation, SF system type, generous touch targets, big numbers. The Looney
Tunes energy is a light seasoning — one loud **carrot-orange** accent (the 🥕
emoji's orange), the **Grobold cartoon font** on headers, the wordmark, and
buttons, a cheeky "What's up, Doc?" voice, the static carrot mascot, and **money
that's finally allowed to be green & red**. The numbers themselves stay Apple
(friendly SF Pro Rounded) so the money is always crisp and trustworthy. Motion
stays calm; the carrot doesn't move.

Tokens live in [`tailwind.config.ts`](../tailwind.config.ts) and
[`src/index.css`](../src/index.css); this doc explains the *what* and *when* so the
look can be reused on new screens.

> **History note.** This replaced an earlier pure-monochrome system where money
> was intentionally colorless. That rule is gone: net worth and entries now carry
> green/red, and the canvas moved from stark white to Apple grouped gray.

## Brand & voice

- **Name / voice:** BucksBuddy — friendly, fast, cheeky, Looney. "What's up, Doc?"
  is the greeting; sprinkle Bugs-isms sparingly in greetings, quips, and empty
  states ("That's all, folks. 🥕", "Spendin' like a wabbit.", "Nothin' here yet,
  Doc."). Keep it short and human. **Primary action labels stay Apple-plain**
  ("Add", "Save", "Done") — the personality lives around them, not on the button.
- **Mascot:** the **🥕 emoji** — rendered as the real system emoji on purpose, so
  on Apple devices it's the exact carrot the brief asked for. Use the
  [`Carrot`](../src/components/ui/Carrot.tsx) component. **It sits still** — the
  carrot never animates (no hop, no wiggle). It appears as a quiet corner mark on
  Home, centered above the login card, and on the splash.
- **Personality:** plain Apple **everywhere**, with the hijack showing up only at
  the points of emphasis — primary action, selected state, the mascot, the hero
  number, money color. If a surface doesn't need personality, leave it plain.
- **Icons:** [`lucide-react`](https://lucide.dev/) — stroke 2, sized 5–7 in tiles,
  4–5 in rows. Don't mix decorative emoji with lucide on the same surface; the
  carrot mascot is the one sanctioned emoji.

## Color tokens

Defined as Tailwind colors. Light-first; dark mode is future work.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F2F2F7` | App background (iOS systemGroupedBackground) |
| `surface` | `#FFFFFF` | Cards, sheets, rows, inputs-on-cards |
| `grouped` | `#E9E9EF` | Numpad keys, inactive tiles, toggle tracks |
| `label` | `#1C1C1E` | Primary text, icons |
| `label-muted` | `#48484A` | Softened dark grey — the BucksBuddy wordmark |
| `label-secondary` | `#8E8E93` | Captions, dates, placeholders, sub-labels |
| `separator` | `rgba(60,60,67,0.12)` | Disabled fills / faint hairlines |
| `carrot` | `#F56300` | **THE** accent — primary button, selected tile, swipe-edit, links |
| `carrot-light` | `#FF8A3D` | Hover/secondary carrot moments |
| `carrot-soft` | `#FFF1E6` | Warm tint backgrounds (row icon chips, pressed keys) |
| `carrot-dark` | `#C44E00` | Carrot text/icons on soft tint |
| `carrot-leaf` | `#5AA82F` | The carrot's greens — decorative only |
| `income` | `#34C759` | Apple green — positive net, money **in** |
| `expense` | `#FF3B30` | Apple red — negative net, money **out** |
| `danger` | `#FF3B30` | Real errors (shares red) |

**Rules:**

- **Money is colored by direction.** All money color comes from `lib/money.ts`:
  `netColorClass` (green > 0, red < 0, neutral at 0) for totals, and
  `amountColorClass(isIncome)` for individual entries. Don't hand-pick hues.
- **Carrot is the only chromatic accent in the chrome** (buttons, selection,
  links, mascot). Green/red are reserved for **money** (and red for errors).
  If you reach for a fourth hue, there isn't one.
- The hero net total, the composer's live amount, history amounts, and the
  In/Out segmented control all show green/red so direction is unmistakable.

## Typography

Three roles, two custom decisions:

- **`font-display` → Grobold.** The chunky Looney Tunes cartoon face, self-hosted
  via `@font-face` from `/public/fonts/`. **Grey only: the logo (wordmark) and
  section headers (History, Settings, the "What's up, Doc?" label).** Never on
  numbers, body, buttons, or anything colored (no white-on-carrot, no green/red).
  Two hard rules: **always `uppercase`** (the font is built for it), and **never
  pure black** — Grobold reads heavy, so it lives in `label-muted` (dark grey) or
  `label-secondary`, never `label` (#1C1C1E). The wordmark stacks on two lines
  (`Bucks` / `Buddy`) with `leading-none`. Falls back to SF Pro Rounded / system
  so nothing breaks offline; ships a single weight, and `font-synthesis: none`
  keeps the browser from faking a heavier one.
- **`font-numeric` → SF Pro Rounded.** Every digit of money — totals, the live
  amount, numpad, history. Stays Apple: friendly and rounded, but with **real
  tabular figures**, so columns line up, typing doesn't jitter, and the heavy
  cartoon ink can't leave ghost trails on iOS. Run it **heavy** (`font-extrabold`
  on big numbers, `font-bold` elsewhere) so the money holds its own next to the
  chunky Grobold headers — SF Pro Rounded ships weights up to Black. Falls back to
  the system stack.
- **default → SF system stack.** All body/UI chrome, labels, captions.

> **Why numbers aren't Grobold.** Grobold has no true tabular figures and its
> heavy ink overflows the glyph box, which caused mis-aligned, oversized digits
> and repaint "ghosting" on iOS. Money is data you scan and trust, so it stays in
> a crisp Apple face; the cartoon is reserved for the chrome around it.

| Role | Classes | Notes |
|---|---|---|
| Wordmark | `font-display text-sm font-bold uppercase leading-none text-label-muted` | Stacked `Bucks`/`Buddy` lockup beside the 🥕 — small, two lines, dark grey |
| Section header | `font-display text-sm font-semibold uppercase tracking-wide text-label-secondary` | "History", Settings title, "What's up, Doc?" |
| Month caption | `text-[13px] font-medium uppercase tracking-wide text-label-secondary` (SF, **not** Grobold) | "JUNE 2026" **above** the hero number |
| Button label | `text-lg font-semibold text-white` (SF, **not** Grobold) | Primary carrot pill — "Add"/"Save" |
| Net total (hero) | `font-numeric text-4xl font-bold tabular-nums` + green/red, left-aligned, month caption above | Home hero card |
| Amount (entry) | `font-numeric text-5xl font-bold tabular-nums` + green/red | The dial's live amount |
| Amount entry | `font-numeric text-4xl font-extrabold tabular-nums` + green/red | Composer live amount |
| History amount | `font-numeric font-medium tabular-nums` + green/red | Entry rows — kept light |
| Numpad keys | `font-numeric text-xl font-bold tabular-nums` | Keypad |
| Body | base (16px), SF | **Min 16px on any `<input>`** or iOS auto-zooms |
| Caption | `text-xs`/`text-sm` + `text-label-secondary` | Dates, hints |

Always use `font-numeric tabular-nums` for money so digits line up and don't
jitter. Grobold (`font-display`) is for *emphasis* — headers, wordmark, buttons —
never numbers and never long body copy.

## Spacing & layout

- **Grid:** 4pt base (Tailwind default scale).
- **Shell:** content capped at `max-w-md`, centered, `px-4` gutter, safe-area
  padding top and bottom. Screens are a vertical stack of **cards** on the
  `canvas`.
- **Navigation:** a **single page** (no tab bar). Top to bottom: the wordmark +
  settings nav, the month-net card, a tappable **"What's up, Doc?"** section that
  reveals the add dial, then History. Settings is a separate hash route reached
  from the gear. Editing a History row opens the dial with the entry loaded and
  scrolls to the top.
- **Hero (month-net card):** clean Apple stat — an uppercase SF **month caption
  on top**, the net number below it (`font-bold`, green/red). Left-aligned, no
  decorative line above it.
- **Cards:** `rounded-card bg-surface shadow-card`. This is the core unit — hero,
  composer, settings rows, history rows are all cards. Separate sections with
  whitespace and rounding, not hairline dividers.
- **Safe areas:** `viewport-fit=cover` + `env(safe-area-inset-*)`, exposed as the
  `--safe-top`/`--safe-bottom` CSS vars and `safe-top`/`safe-bottom` tokens.
  Bottom controls clear the home indicator: `pb-[calc(2rem+var(--safe-bottom))]`.
- **Touch targets:** minimum 44×44pt. Numpad keys (`py-4`) and category tiles
  (`py-5`) keep generous padding.

## Radii, shadows, surfaces

- `rounded-card` = **22px** for cards, tiles, numpad keys, swipe-row containers.
- `rounded-pill` for segmented controls, currency toggles, and the primary action.
- `shadow-card` — light Apple elevation for white cards on the gray canvas. Keep
  it subtle; heavy drop shadows read as visually "heavy" on this layout.
- `shadow-segment` — small lift for the active segment in pill toggles.
- `shadow-carrot` — subtle warm tint under the carrot primary action / selected tile.

## Core components

Each lives in `components/ui/` (or `components/`). States:
**default → active/selected → pressed → disabled**.

- **Carrot** — the static 🥕 mascot. Decorative; pass a font-size class.
- **InOutToggle** — pill segmented control on a `grouped` track. Active fills with
  **money color**: Out = `bg-expense text-white`, In = `bg-income text-white`;
  inactive = `text-label-secondary`. Direction reads at a glance.
- **CategoryGrid** — 3-col tiles (lucide icon + label). Selected =
  `bg-carrot text-white shadow-carrot`; unselected tiles get a **soft tint of the
  category's own color** (`categoryColor()` from `lib/categories.ts`, ~10% alpha
  background + full-strength icon) so the grid reads colorful, not bland gray.
- **CurrencyToggle** — small USD/LBP pill; active = `bg-white text-carrot shadow-segment`.
- **Numpad** — digits + `.` + `⌫`. **No `<input>`** — emits keys; parent holds a
  string (`applyKey` enforces single dot / max 2 decimals). `⌫` is carrot-tinted;
  **hold it (~400ms) to clear the whole amount** (emits the `clear` key + a
  stronger haptic). A short tap deletes one character.
- **NetTotal** — **left-aligned** Apple stat inside the Home money card: an
  uppercase SF month caption on top, the number in `font-numeric font-bold`
  **green/red** (via `netColorClass`) directly below.
- **AddComposer** — **money-first** dial, revealed by "What's up, Doc?": a quiet
  `$/LBP` toggle, then the **big live amount** (`font-numeric text-5xl`, tinted by
  direction), a quiet keypad (`1-9 . 0 ⌫`; backspace deletes on `click`, holds to
  clear), a **Category** form-row that opens the `CategorySheet` (In/Out + grid),
  and a flat carrot **Add/Save** pill.
- **HistoryList row** — lucide icon in a round chip tinted with the **category's
  own color** (`categoryColor()`, ~10% alpha bg + full-strength icon) + label +
  date + **green/red** signed amount. Rows are cards (`shadow-card`), spaced with
  `gap-1.5`, no divide-y hairlines. Swipe reveals **icon** actions: **Edit =
  carrot panel** (Pencil); **Delete = red (`bg-expense`) panel** (Trash2). Drag
  uses `framer-motion` with a light crisp tween snap (160ms), low elasticity.
- **Primary button** — `rounded-pill bg-carrot text-white font-display shadow-carrot`.
  Disabled → `bg-separator text-label-secondary`, no shadow. Compact pill, centered.
- **Action link** — inline `text-carrot font-semibold` ("Cancel edit", "Done").

## Motion

Keep it light. The personality is in the color and voice, not heavy animation.

- **Press feedback:** the `.press` utility — a quick, calm `scale(0.97)` on
  `:active`. On every tappable.
- **Entrance:** `animate-pop` (small, no-overshoot scale-in) for confirmations /
  freshly shown elements.
- **Mascot:** static. The carrot never moves.
- **Drag (history rows):** `framer-motion` `drag="x"`, low `dragElastic` (0.06),
  light crisp **tween** snap (160ms) — no springy overshoot. Velocity-aware commit.
- **Haptics:** progressive enhancement only — `navigator.vibrate(8)` on numpad
  keys, a stronger `vibrate(20)` on hold-to-clear (Android). iOS ignores it;
  never block the flow on haptics.

## Reuse guide

1. Consume tokens via Tailwind classes (`bg-canvas`, `bg-surface`, `shadow-card`,
   `bg-carrot`, `text-income`/`text-expense`, `font-display` for headers/buttons,
   `font-numeric` for money) — never hardcode hex/px.
2. Money formatting → always `lib/money.ts`; currency math → `lib/currency.ts`.
3. New screens follow the shell: `mx-auto max-w-md px-4`, safe-area padding, a
   vertical stack of `rounded-card bg-surface shadow-card` sections on the canvas.
4. New tappable elements get `.press` and a ≥44pt target. Selection/primary =
   carrot; money = green/red; everything else = plain Apple.
5. **Keep the palette to plain Apple + carrot + money green/red.** Personality is
   a seasoning (mascot, display font, voice, springs), not a coat of paint —
   apply it only at points of emphasis.
