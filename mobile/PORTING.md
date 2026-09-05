# Porting contract — web (`../src`) → mobile (`src`)

The mobile app must be **visually identical** to the PWA and feel **native-smooth**.
Every screen/component in `src/` mirrors the file of the same name in `../src/`.
Read the web file first, then port it line by line against this contract.

## 1. Foundation you must use (do not reinvent)

| Web                                  | Mobile                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `<main class="mx-auto max-w-md …">`  | `<Screen>` from `components/ui/Screen` (scroll + column + safe areas)  |
| dark page gradient + fixed floor     | `<Screen gradient={…}>`; `Gradient` = `{colors, stops(px), floor}`     |
| `<header>` back chevron + title      | `<NavHeader title dark? tint?>` — `onBack` defaults to `back()`        |
| any `<button class="press …">`       | `<Press>` from `components/ui/Press` (Reanimated scale 0.97, 100ms)    |
| `<button>` without `.press`          | `<Press noScale>`                                                      |
| `disabled:opacity-50`                | `<Press disabled disabledOpacity={0.5}>`                               |
| `active:bg-…`                        | `<Press pressedStyle={{ backgroundColor }}>`                           |
| `navigate("/x")`                     | `navigate("/x")` from `lib/router` (native stack push; "/" pops to root)|
| back to previous page                | `back()` from `lib/router` (NavHeader does this by default)            |
| `window.confirm(msg)`                | `Alert.alert(msg, undefined, [Cancel, {Delete, destructive}])`         |
| tokens: colors/radius/space/text     | `lib/theme.ts` — `colors`, `radius`, `space(n)`, `text.sm`, `weight`   |
| `shadow-card` / `shadow-segment` / `shadow-carrot` | `boxShadow: shadows.card` etc. (string; layered CSS shadow)  |
| `ring-1 ring-inset ring-white/5`     | `boxShadow: shadows.ringWhite5` (inset — never a `borderWidth`)        |
| `font-display uppercase`             | `...display` (never add `fontWeight` to Grobold)                       |
| `font-numeric tabular-nums`          | `...numeric`                                                           |
| `text-white/55`, `bg-black/25`       | `white(0.55)`, `black(0.25)`                                           |
| `${color}1A` / `${color}26` / `${color}33` | `withAlpha(color, 0.1 / 0.15 / 0.2)`                              |
| `tracking-wide`                      | `letterSpacing: trackingWide(fontSize)`                                |
| `leading-none/tight/snug/relaxed`    | `lineHeight: leading.tight(fontSize)` etc.                             |
| lucide-react icon `className="h-5 w-5" strokeWidth={2}` | `<Icon size={20} strokeWidth={2} color={…} />`      |
| `<svg>`                              | `react-native-svg`                                                     |
| `Intl`/`toLocaleDateString`          | unchanged (Hermes has Intl)                                            |

## 2. Spacing and type — exact Tailwind values

- `p-N` = `N*4` pt (`p-3.5` = 14, `p-1.5` = 6, `gap-2.5` = 10).
- Text sizes: `text-xs` 12/16, `text-sm` 14/20, `text-base` 16/24, `text-lg` 18/28,
  `text-xl` 20/28, `text-2xl` 24/32, `text-3xl` 30/36, `text-4xl` 36/40,
  `text-5xl` 48/48, `text-6xl` 60/60. Arbitrary `text-[13px]` → `text["13"]`.
  Use the `text.*` objects from theme so fontSize + lineHeight come together.
- Weights: `font-medium` 500, `font-semibold` 600, `font-bold` 700 (never on Grobold).
- `rounded-card` 22, `rounded-pill` 9999, `rounded-t-[28px]` 28, `rounded-lg` 8.
- `max-w-md` 448 — `Screen` handles it.
- `h-9 w-9` 36, `h-10 w-10` 40, `h-8 w-8` 32, `h-11 w-11` 44, `h-7 w-7` 28.
- Two-column grids (`grid-cols-2 gap-2`): measure the container with `onLayout`
  and compute `(width - gap) / 2` — do not guess percentages.

## 3. Shadows, rings, clipping — the rules that were wrong before

- Shadows are `boxShadow` **strings** from `theme.shadows`. Never `shadowColor`/`elevation`.
- A view that clips (`overflow: "hidden"`) must not also carry the shadow: put the
  shadow on a wrapper **around** the clipping view, both with the same `borderRadius`
  and the wrapper with the card's `backgroundColor`.
- **Swipe rows**: the outer frame is `overflow: hidden` + `borderRadius: radius.card`.
  The action buttons (edit/delete) are absolutely positioned, full-height rectangles
  behind. The sliding content is a **rectangle with no borderRadius** — the frame
  clips it. (On the web: `relative overflow-hidden rounded-card` outer, plain
  `motion.div` inner.) The old port put a radius on the content and left gaps.
- Rings are inset `boxShadow`s, not borders, so they don't change layout.

## 4. Motion — what "smooth" means here

- Press feedback: `<Press>` (already animated). Use it for every button.
- Segmented toggles with the web's `transition` class: animate the active
  background with Reanimated (`interpolateColor` over `motion.transition` = 150ms),
  not an instant swap.
- Swipe rows: gesture-handler `Pan` + Reanimated `translateX` on the UI thread; snap
  with `withTiming(target, {duration: motion.snap, easing: Easing.bezier(...motion.snapEase)})`;
  auto-close after 2000ms; velocity projection `x + vx * 0.08`; clamp to ±76 with
  0.06 elasticity past the limit. A tap on an open row closes it.
- Expand/collapse (HistoryStack): `Animated.View layout={LinearTransition.duration(220)}`
  plus `entering={FadeIn.duration(220)}` on revealed rows.
- Sheets: slide from bottom 250ms with `Easing.bezier(0.2, 0.8, 0.2, 1)`, scrim
  fades, drag-down to dismiss (>120px or velocity >600).
- Never use `LayoutAnimation` from RN; use Reanimated layout animations.

## 5. Performance

- Long lists (History, 500 rows) must virtualize: `SectionList`/`FlatList` with
  `ListHeaderComponent`, inside `ScreenFrame` (not `Screen`). Rows must be
  memoized (`React.memo`) and keyed by id. `initialNumToRender` ≈ 12.
- Never create Reanimated shared values per row *outside* the row component.
- Keep `useMemo` on grouping/aggregation exactly as the web does.

## 6. Copy and behaviour

- Every string, placeholder, label, empty state and error message is copied
  verbatim from the web file (including "Nothin' here yet, Doc.").
- Every conditional (locked, masked, loading, empty, LBP hint…) is preserved.
- Analytics: same `posthog.capture` events with the same properties.
- Status bar: dark rooms pass `statusBar="light"` to `Screen`/`ScreenFrame`.

## 7. Done means

- `npx tsc --noEmit` passes in `mobile/`.
- No `shadowColor`, `elevation`, `borderWidth`-as-ring, or `KeyboardAvoidingView`.
- A reader comparing the web file and the mobile file side by side finds the
  same elements in the same order with the same numbers.
