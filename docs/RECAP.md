# BucksBuddy Recap

Stats → **Recap** opens `#/recap?month=YYYY-MM`: one month of logging turned
into a collectible **trading card** (5:7, 1080×1512) or a **story**
(9:16, 1080×1920) to share. Free for everyone, for any current or past month.

## The fun engine

A month's card is meant to feel different every month, and better the more
you log — never the more you spend.

- **Type and palette.** The leading category by amount share is the card's
  type; its own color (from `lib/categories`) drives the whole palette. A
  runner-up within 80% of the leader makes it a **dual type** and splits the
  frame.
- **Rarity is coverage.** `daysLogged / max(daysAvailable, 7)`: Common
  (<35%), Uncommon (35–59%), Rare (60–79%), Epic (80–99%), Legendary (every
  day). A streak earns a tier too (7 / 14 / 21 straight days → Uncommon /
  Rare / Epic); Legendary only comes from coverage. The rarity picks the
  frame's foil and how many glints the art zone gets; the glints' positions
  come from a seed on the month key, so the same month exports pixel-identical
  on any device.
- **Titles.** `lib/recapTitles` holds 57 earnable titles plus 3 fallbacks:
  one per leading category ("BEAN COUNTER.", "SPOT HUNTER."), subcategory
  titles ("DOORBELL DINER.", "HOME BARISTA."), patterns ("AFTER HOURS.",
  "WEEKEND WABBIT.", "GLOBETROTTER."), achievements ("SEVEN STRAIGHT.",
  "CLOCKWORK.", "FULL MOON.") and seasonal ones ("SANTA'S INTERN.", "LEAP DAY
  LOGGER."). Pattern titles need at least 8 entries so one Saturday coffee
  can't headline. The month opens on a title chosen from the best tier earned
  (topped up to three candidates from the next tiers), rotated by the month's
  seed — so the same habits two months running open on different titles. A
  Legendary is never rotated away. Every earned title is a chip the user can
  pick instead; the rest ride along as stamps on the story.
- **Stats on the card:** days logged, the streak (with a flame that goes
  grey → bronze → silver → gold), the spectrum (categories used out of 18),
  the habitat (Weekends / Weekdays / After dark / Sunrise / Anytime, which
  also textures the art zone), entries, and a region stamp when two or more
  currencies were typed in (a count, never the codes).
- **Next pull.** Under the card: how many more days would make this month's
  pull rarer, computed from this month alone.

## Privacy

- The card shows percentages and counts. **Amounts and the name are off
  every time the room opens**; only the toggles put them on the card, and
  the preview is exactly the export.
- Nothing is uploaded: the SVG is rasterized to PNG on the device and handed
  to the share sheet or saved. The filename (`bucksbuddy-recap-YYYY-MM-card.png`
  / `-story.png`) and the share text ("TITLE My September 2026 on
  BucksBuddy." plus the landing URL with `utm_campaign=recap_v1`) never carry a
  name or an amount.
- Analytics (`recap_opened`, `recap_exported`, `recap_failed`) carry only
  bounded properties: style, current/past, rarity, method, whether the
  amounts/name toggles were on, and a failure stage. Never a title, category,
  amount or name.
- Titles are playful labels for what got logged, never verdicts: no "too
  much", no comparisons, no money words. A hospital entry removes the health
  title for that month.

## Data

- The month is fetched **complete and fresh** (`lib/recapQuery`): paged with
  a stable order and an exact count, de-duplicated by id, refused if it
  comes back short or the count moves mid-fetch. It never reads the store's
  capped newest-500 window or the on-device snapshot, and it decrypts through
  the same vault as everything else (`store.loadMonth`).
- Spending facts (`lib/recap`) use money OUT only: income, refunds and moves
  into the Safe never count; subcategories fold into their parent; unknown
  ids become Other. Percentages are largest-remainder rounded so the split
  totals 100. Logging facts (days logged, streak) count every row, because
  they measure the habit.
- A masked, negative or non-finite amount blocks the card with a retry — no
  partial exports.

## Rendering

- Both layouts are React-built SVG (`components/recap`) measured with static
  glyph tables (`lib/recapText`, regenerated from `public/fonts` with
  opentype.js), so the preview, the export and the tests lay out identically
  and nothing waits on a font.
- Export (`lib/recapExport`) serializes that same SVG with Grobold and
  Nunito embedded as base64 woff2, draws it through an `Image` onto a canvas
  and reads the PNG back. The share path prefers Web Share with the file,
  falls back to the file alone, then to a download; a dismissed sheet is
  neutral.

## Checked, and what's left

- Chromium (Playwright, this checkout): both layouts export at 1080px
  through the real path with fonts, icons, gradients and clip paths intact;
  long LBP amounts, a 24-character name, one/two/three-category months, every
  habitat texture and every rarity foil were inspected as PNGs. The screen
  was walked through at 390px: loading, locked, error, empty, card, story,
  toggles, name, paging.
- Not yet done here (no device, no live backend): the share sheet on iOS
  Safari / the installed PWA and Android Chrome (Save Image, cancel,
  a target refusing the file → PNG-only → download), desktop Safari's
  download, and a live month with more than 500 rows. Do these on a phone
  before announcing it.

## Preview it

```bash
npm run recap:preview
```

Then open `http://localhost:5199/` for every fixture as a card and a story,
or `http://localhost:5199/screen.html?scenario=food#/recap?month=2026-09`
for the whole room over a stand-in store (`scenario=locked|error|loading`).
All rows are fictional; `window.exportPng("food")` runs the real export for
one fixture and resolves with a data URL.
