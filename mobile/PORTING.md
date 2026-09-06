# Porting contract — web (`../src`) → mobile (`src`)

**The rule that matters: keep the class names.** Every mobile file is its web
counterpart with the elements swapped and the `className` strings left alone.
`tailwind.config.js` here is a copy of the web's, so a class resolves to the
same value in both. If you find yourself typing a number that appears in the
web file as a class, stop — you are doing it wrong.

```tsx
// web — src/screens/Home.tsx
<div className="relative min-h-[188px] overflow-hidden rounded-card bg-surface px-5 py-5 shadow-card">
  <p className="mt-1 text-[13px] font-medium text-label-secondary">{monthLabel()}</p>
</div>

// mobile — same classes, different elements
<View className="relative min-h-[188px] overflow-hidden rounded-card bg-surface px-5 py-5 shadow-card">
  <Text className="mt-1 text-[13px] font-medium text-label-secondary">{monthLabel()}</Text>
</View>
```

## 1. Element mapping

| Web | Mobile | Notes |
| --- | --- | --- |
| `<div>` | `<View>` | |
| `<p> <span> <h1> <h2> <h3>` | `<Text>` | all text must be inside a `Text` |
| `<button>` | `<Press>` (`components/ui/Press`) | carries the `.press` scale |
| `<button>` without `.press` | `<Press noScale>` | |
| `<input>` | `<TextInput>` | |
| `<form onSubmit>` | no element — call the handler from `onSubmitEditing` / the button | |
| `<ul> <li>` | `<View>` | |
| `<a href>` | `<Text onPress={() => Linking.openURL(href)}>` | keep the same classes |
| `<main>` | `<Screen className="…">` | pass `<main>`'s classes through |
| `<svg>` | `react-native-svg` | |
| `onClick` | `onPress` | |
| `aria-label` | `accessibilityLabel` | |
| `disabled` | `disabled` (works on Press) | |
| `window.confirm(msg)` | `Alert.alert(msg, undefined, [Cancel, {Delete, destructive}])` | |
| `localStorage` | already ported in `lib/` | don't touch |

## 2. The five things that are not a straight swap

**a. Text styles do not inherit.** On the web, `<main className="text-white">`
colors every `<p>` inside it. React Native only inherits from `Text` to nested
`Text`. So when a container carries a text class (`text-white`, `text-label`,
`font-numeric`, `text-sm`…), copy that class onto each `Text` inside it. Keep it
on the container too — harmless, and it keeps the diff against the web small.

**b. Icons take props, not classes.** `lucide-react-native` sizes and colors
through props:

```tsx
// web
<ChevronLeft className="h-6 w-6" strokeWidth={2.5} />        // color from text-carrot on the parent
// mobile
<ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
```
`h-N w-N` → `size={N * 4}`. The color comes from `colors` in `lib/theme` (or a
per-category value the web already computes in JS).

**c. `framer-motion` → `react-native-reanimated`.** `motion.div` with
`initial/animate/exit` → `Animated.View` with `entering/exiting/layout`
(`FadeIn`, `FadeOut`, `LinearTransition`). Drag (`drag="x"`, `dragConstraints`)
→ `react-native-gesture-handler` `Gesture.Pan()` driving a shared value. Timings
and easings are in `lib/theme`'s `motion`. Swipe rows and the category sheet are
the only places this comes up.

**d. Safe areas.** `var(--safe-top)` / `env(safe-area-inset-*)` don't exist.
`Screen` already adds the insets; anywhere else use `useSafeAreaInsets()`.

**e. Fixed positioning.** `fixed inset-0` (the gradient floors) is handled by
`Screen`/`ScreenFrame` — pass `gradient` and, for Home's savings tint,
`gradientFixed`. Don't hand-roll it.

## 3. Foundation — use it, don't rebuild it

- `components/ui/Screen` — `Screen` (scroll + centered column + safe areas +
  gradient) and `ScreenFrame` (backdrop only, for list screens). `GradientLayer`
  if you need the gradient inside your own list.
- `components/ui/Press` — every tappable thing.
- `lib/router` — `navigate("/x")` and `back()`, same routes as the web's hash
  router, on a native stack (`App.tsx`). Native push/pop and swipe-back come free.
- `lib/theme` — `colors` (for icon/gradient/placeholder **props** only),
  the four `Gradient`s, `motion` durations, `withAlpha`.
- Everything in `lib/` other than that is the web's logic, already ported. Don't
  edit it.

## 4. Classes that need care

- `shadow-card` / `shadow-segment` / `shadow-carrot` — defined in our config,
  they work. Don't substitute `boxShadow` or `elevation`.
- `ring-1 ring-inset ring-white/5` — NativeWind maps ring to a box shadow. If a
  ring doesn't render over an opaque child, use `border` + a matching inset,
  and say so in a comment.
- `backdrop-blur` — not supported. Skip it (the Safe's cards look fine without).
- `divide-y` — not supported. Put `border-t border-separator` on each row after
  the first.
- `truncate` → `numberOfLines={1}` on the `Text` (keep the class too).
- `outline-none`, `cursor-*`, `select-none`, `-webkit-*` — browser-only, drop.
- `transition` / `duration-*` / `active:*` — supported, keep them.
- Percentage widths inside a `flex-wrap` grid (`grid-cols-2 gap-2`): React Native
  has no CSS grid. Use `flex-row flex-wrap` and give children an explicit width
  measured with `onLayout` — `(width - gap) / 2` — or `flex-1` in explicit rows.

## 5. Performance

- The History page renders every transaction (up to 500) — it must virtualize
  (`SectionList`/`FlatList`), not map over an array. Rows `React.memo`'d,
  `keyExtractor` stable, callbacks `useCallback`'d.
- Everything else maps like the web does; the lists are short.

## 6. Copy and behaviour

Every string, placeholder, empty state and error message comes over verbatim
("Nothin' here yet, Doc."). Every conditional (locked, masked, loading, LBP
hint) is preserved. Same `posthog.capture` events with the same properties.

## 7. Done means

- `npx tsc --noEmit` passes.
- No `StyleSheet.create` for anything a class can express. (`StyleSheet` is fine
  for gradient layers, absolute fills, and measured widths.)
- Reading the web file and the mobile file side by side, the `className` strings
  match line for line.
