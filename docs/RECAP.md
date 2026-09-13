# BucksBuddy Recap

Stats → Recap carries the selected month into `#/recap?month=YYYY-MM`.
Direct visits use the current local month. Both styles, all eligible titles,
customization, PNG downloads and sharing are free.

## Data and privacy

Recap initializes the existing vault/profile without fetching the capped recent
history. Its separate authorized monthly query fetches pages in occurred_at / ID
order, requests exact counts, deduplicates IDs and refuses missing or shifting
pages. It uses local calendar boundaries and the store's existing decryption
function. Income/refunds, Safe cash and gold are excluded. Positive home-currency
hundredths are summed once; invalid amounts block export. Category ranking and
largest-remainder percentages are deterministic.

Names and amounts default off each time the screen opens. Only permitted content
is rendered in the card and its accessible description. The finished PNG is the
preview; the same Blob is downloaded/shared. Settings changes, month changes,
store writes, focus/reconnect and transaction realtime events invalidate it.
Lock/sign-out unmount the capture and revoke its object URL. Downloads already
saved are snapshots. Recap never writes a card, image or transaction to a server.

The six analytics events use the existing PostHog client, with only style,
current/past and stage properties. Recap also uses the client's existing
`ph-no-capture` replay/autocapture exclusion. No raw errors or financial content
are sent by Recap. The generic share URL uses the issue's campaign parameters;
existing landing-page analytics can attribute visits without a new backend.

## Rendering and sharing

The Recap screen and rasterizer are loaded on demand. Fontsource's locally
packaged Bricolage Grotesque and DM Sans assets are precached by the PWA; their
OFL notices ship under `public/fonts/licenses`. Lucide icons and the existing
carrot mascot are reused. Cards always use the approved light palettes.

PNG rendering waits for the fonts. Export is 1080 pixels wide; its height follows
the content. Preparing the Blob before a tap preserves native share activation.
File capability is the native-share gate. A rejected combined file/text/URL
share offers a new PNG-only gesture and Download PNG. Cancellation is neutral;
a resolved promise does not claim recipient delivery. URLs are revoked on
replacement/unmount, not immediately after the download click.

## Verification and release checklist

Automated tests cover complete pagination beyond 500 rows, short server pages,
ID deduplication, changing counts, query/decryption failures and cancellation;
real encryption/unlock integration; category/subcategory aggregation, zeroes,
invalid/overflowing values, income/refunds/Safe, ties and exact rounding; local
month/year boundaries; title eligibility; privacy defaults, controls, stale
responses/images, lock, initialization retry, export failures and share fallback.
The repository's 100% coverage thresholds remain unchanged.

Desktop Chromium verification uses fictional data through the real screen and
PNG renderer. Saved PNGs for both styles were inspected with amounts off/on and
a 24-character name. A 320px viewport is used to check the narrow preview. The
backend is mocked for browser visual checks; live Supabase credentials are not
part of this checkout. Query and vault integration are covered by automated tests.

The issue's supplied 600-unit fixture has Food 228, Groceries 150, Parking 114,
and Fun 108. The specified ranking therefore yields Food 38%, Groceries 25%,
Everything else 37%, and the generic monthly headline. It cannot simultaneously
yield Food/Parking as the top two. Tests intentionally follow the data contract.

Before leaving draft/releasing, complete these physical-device checks:

- iOS Safari and installed PWA: native file share, cancel, destination rejection,
  PNG-only retry, Save Image/Save to Files; confirm returning to the app works.
- Android Chrome and installed PWA: native file share, cancel, rejection/retry,
  and Downloads/save behavior.
- Desktop Safari/Chrome: verify native sharing where file support is advertised;
  otherwise Download PNG. Chromium download was exercised locally.
- Confirm the signed-in production/staging Supabase project serves a complete
  older month and a >500-row month, and transaction realtime is enabled.

Physical-device share-sheet behavior and live-backend checks are outstanding;
unit mocks and a narrow Chromium viewport do not establish those results.

## Reproduce the visual check

Run `npm run recap:preview`, then open
`http://127.0.0.1:5173/scripts/recap/index.html` (add `?stress=1` for large
LBP figures). This separate Vite config substitutes a fictional store and
realtime client, runs analytics in test mode, and is outside the production
entry point. Change styles, titles and privacy controls, then inspect the
files produced by Download PNG. The real authorized query is tested separately.

The inspected exports are available here:

| Style | Privacy defaults | Name and amounts enabled |
| --- | --- | --- |
| Trading card | [PNG](recap/trading-default.png) | [PNG](recap/trading-amounts.png) |
| Monthly recap | [PNG](recap/monthly-default.png) | [PNG](recap/monthly-amounts.png) |

All four exports are 1080 pixels wide and contain only IHDR, IDAT and IEND PNG
chunks (no text metadata). A large-LBP stress fixture also rendered without
clipping; the 320px viewport had matching page/client widths (305px after its
scrollbar), so the preview introduced no horizontal scrolling.
