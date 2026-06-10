// Regenerates the social-share card at public/og-image.png (1200x630).
//
// It's a one-off asset generator, not part of the app build, so its
// dependencies are intentionally kept out of package.json. Run it with:
//
//   npm i --no-save satori @resvg/resvg-js
//   node scripts/generate-og.mjs
//
// The card mirrors the marketing landing page (src/screens/Landing.tsx) on the
// left — carrot app icon, the Grobold "BUCKS BUDDY" wordmark, the cheeky
// tagline, a "Free / No ads / Install anywhere" pill — and on the right a phone
// mockup of the real Home screen (src/screens/Home.tsx), on the carrot-orange
// gradient.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Grobold (self-hosted display font) for the wordmark; Liberation Sans — a
// metric-compatible Helvetica/Arial clone shipped on most Linux boxes — for the
// body copy. Swap the sans paths if you run this elsewhere.
const grobold = readFileSync(`${ROOT}public/fonts/grobold.ttf`);
const sansReg = readFileSync("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf");
const sansBold = readFileSync("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf");
const carrot = readFileSync(`${ROOT}public/icons/icon-512.png`);
const carrotUri = `data:image/png;base64,${carrot.toString("base64")}`;

const W = 1200, H = 630;

// --- tiny element builders -------------------------------------------------
const el = (type, style, children) => ({ type, props: { style, children } });
const img = (src, w, h) => ({ type: "img", props: { src, width: w, height: h, style: { width: w, height: h } } });
const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// Lucide icon inner geometry (lucide-static v1.17), keyed by name. Rendered to
// a data-URI SVG so resvg can rasterize it at any tint/size.
const LUCIDE = {
  vault: `<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="7.5" cy="7.5" r=".5" fill="C"/><path d="m7.9 7.9 2.7 2.7"/><circle cx="16.5" cy="7.5" r=".5" fill="C"/><path d="m13.4 10.6 2.7-2.7"/><circle cx="7.5" cy="16.5" r=".5" fill="C"/><path d="m7.9 16.1 2.7-2.7"/><circle cx="16.5" cy="16.5" r=".5" fill="C"/><path d="m13.4 13.4 2.7 2.7"/><circle cx="12" cy="12" r="2"/>`,
  settings: `<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>`,
  eye: `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>`,
  banknote: `<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>`,
  coins: `<path d="M13.744 17.736a6 6 0 1 1-7.48-7.48"/><path d="M15 6h1v4"/><path d="m6.134 14.768.866-.5 2 3.464"/><circle cx="16" cy="8" r="6"/>`,
  tag: `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="C"/>`,
  chevronRight: `<path d="m9 18 6-6-6-6"/>`,
  briefcase: `<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>`,
  cart: `<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>`,
  coffee: `<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>`,
  party: `<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>`,
};

// A lucide icon as an <img>, stroked in `color`.
function lic(name, color, size, sw = 2) {
  const inner = LUCIDE[name].replaceAll('"C"', `"${color}"`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return img(dataUri(svg), size, size);
}

// iOS status-bar glyphs (filled, dark).
const signalIcon = img(dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#000"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#000"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#000"/><rect x="15" y="0.5" width="3" height="11.5" rx="1" fill="#000"/></svg>`), 18, 12);
const wifiIcon = img(dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="17" height="12" viewBox="0 0 24 17"><path d="M12 16.5l3.2-4a4 4 0 0 0-6.4 0z" fill="#000"/><path d="M12 9.2c2.3 0 4.4.9 6 2.3l2.1-2.6A14 14 0 0 0 12 5.6 14 14 0 0 0 3.9 8.9L6 11.5a9.2 9.2 0 0 1 6-2.3z" fill="#000"/><path d="M12 1.5a19 19 0 0 0-11 3.5l2.1 2.6A15.6 15.6 0 0 1 12 4.4c3.4 0 6.5 1.1 9 3.2L23 5A19 19 0 0 0 12 1.5z" fill="#000"/></svg>`), 17, 12);
const batteryIcon = img(dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="27" height="13" viewBox="0 0 27 13"><rect x="0.6" y="0.6" width="22" height="11.8" rx="3" fill="none" stroke="#000" stroke-opacity="0.35"/><rect x="2.2" y="2.2" width="16.5" height="8.6" rx="1.6" fill="#000"/><rect x="24" y="4" width="2.2" height="5" rx="1.1" fill="#000" fill-opacity="0.35"/></svg>`), 27, 13);

// --- colors ----------------------------------------------------------------
const GREEN = "#34C759", RED = "#FF3B30", CARROT = "#F56300", GOLD = "#A16207";
const LABEL = "#1C1C1E", MUTED = "#48484A", SECOND = "#8E8E93";

// A circular tinted icon chip used by the safe pill and history rows.
const chip = (size, bg, node) =>
  el("div", { display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 9999, backgroundColor: bg }, [node]);

// A single history row.
function historyRow(iconName, iconColor, iconBg, title, sub, amount, amountColor) {
  return el("div", {
    display: "flex", alignItems: "center", gap: 12,
    backgroundColor: "#FFFFFF", borderRadius: 18, padding: "11px 14px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  }, [
    chip(38, iconBg, lic(iconName, iconColor, 20)),
    el("div", { display: "flex", flexDirection: "column", flex: 1 }, [
      el("div", { color: LABEL, fontSize: 17, fontWeight: 700 }, title),
      el("div", { color: SECOND, fontSize: 12 }, sub),
    ]),
    el("div", { fontWeight: 700, fontSize: 17, color: amountColor }, amount),
  ]);
}

// --- the phone -------------------------------------------------------------
const SCREEN_W = 316;
const phone = el("div", {
  position: "absolute", top: 64, left: 792, width: 340, height: 720,
  display: "flex", backgroundColor: "#0B0B0C", borderRadius: 54, padding: 12,
  boxShadow: "0 18px 40px rgba(40,12,0,0.30)",
}, [
  el("div", {
    display: "flex", flexDirection: "column", width: SCREEN_W, borderRadius: 44,
    backgroundImage: "linear-gradient(180deg, #E6F8EE 0%, #F2F2F7 230px)",
    padding: "14px 16px 0 16px", position: "relative",
  }, [
    // Dynamic Island
    el("div", { position: "absolute", top: 12, left: 108, width: 100, height: 28, borderRadius: 9999, backgroundColor: "#0B0B0C" }),

    // status bar
    el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", height: 30, marginBottom: 6 }, [
      el("div", { fontSize: 15, fontWeight: 700, color: LABEL, paddingLeft: 6 }, "9:41"),
      el("div", { display: "flex", alignItems: "center", gap: 6, paddingRight: 4 }, [signalIcon, wifiIcon, batteryIcon]),
    ]),

    // app header
    el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 12 }, [
      el("div", { display: "flex", alignItems: "center", gap: 7 }, [
        img(carrotUri, 26, 26),
        el("div", { display: "flex", flexDirection: "column", fontFamily: "Display", fontSize: 13, lineHeight: 0.92, color: MUTED, textTransform: "uppercase" }, [el("div", {}, "Bucks"), el("div", {}, "Buddy")]),
      ]),
      el("div", { display: "flex", alignItems: "center", gap: 14 }, [lic("vault", SECOND, 22, 1.75), lic("settings", SECOND, 22, 1.75)]),
    ]),

    // balance card
    el("div", { display: "flex", flexDirection: "column", backgroundColor: "#FFFFFF", borderRadius: 22, padding: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }, [
      el("div", { fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: SECOND }, "June 2026"),
      el("div", { fontSize: 34, fontWeight: 700, color: GREEN, marginTop: 2 }, "+$1,728.90"),
      // safe pill
      el("div", { display: "flex", alignItems: "center", gap: 10, marginTop: 14, backgroundColor: "rgba(52,199,89,0.10)", borderRadius: 18, padding: "10px 12px" }, [
        chip(34, "rgba(52,199,89,0.16)", lic("vault", GREEN, 18)),
        el("div", { display: "flex", flexDirection: "column", flex: 1 }, [
          el("div", { fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: GREEN }, "In the safe"),
          el("div", { display: "flex", alignItems: "center", gap: 12, marginTop: 2 }, [
            el("div", { display: "flex", alignItems: "center", gap: 5, color: GREEN, fontSize: 17, fontWeight: 700 }, [lic("banknote", GREEN, 15), "••••"]),
            el("div", { display: "flex", alignItems: "center", gap: 4, color: GOLD, fontSize: 13, fontWeight: 700 }, [lic("coins", GOLD, 13), "•••"]),
          ]),
        ]),
        lic("eye", "rgba(52,199,89,0.7)", 18),
      ]),
    ]),

    // section header
    el("div", { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: SECOND, margin: "16px 0 8px 4px" }, "What's up, Doc?"),

    // add composer
    el("div", { display: "flex", flexDirection: "column", gap: 10, backgroundColor: "#FFFFFF", borderRadius: 22, padding: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }, [
      el("div", { display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(60,60,67,0.12)", borderRadius: 16, padding: "8px 12px" }, [
        chip(38, "#FFF1E6", el("div", { color: CARROT, fontSize: 16, fontWeight: 700 }, "$")),
        el("div", { flex: 1, fontSize: 28, fontWeight: 700, color: SECOND }, "0.00"),
        el("div", { fontSize: 13, fontWeight: 700, color: SECOND }, "USD"),
      ]),
      el("div", { display: "flex", alignItems: "center", gap: 10, border: "1px dashed rgba(245,99,0,0.4)", backgroundColor: "rgba(255,241,230,0.4)", borderRadius: 16, padding: "9px 12px" }, [
        chip(38, "#FFF1E6", lic("tag", CARROT, 19)),
        el("div", { display: "flex", flexDirection: "column", flex: 1 }, [
          el("div", { color: LABEL, fontSize: 15, fontWeight: 700 }, "Add Category"),
          el("div", { color: SECOND, fontSize: 12 }, "Income or expense"),
        ]),
        lic("chevronRight", SECOND, 18),
      ]),
      el("div", { display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#E9E9EF", borderRadius: 9999, padding: "12px 0", fontSize: 16, fontWeight: 600, color: SECOND }, "Enter an amount"),
    ]),

    // history header
    el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 4px 8px 4px" }, [
      el("div", { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: SECOND }, "History"),
      el("div", { fontSize: 13, fontWeight: 700, color: CARROT }, "Show all"),
    ]),
    el("div", { display: "flex", flexDirection: "column", gap: 6 }, [
      historyRow("briefcase", GREEN, "rgba(52,199,89,0.10)", "Salary", "Today", "+$1,800.00", GREEN),
      historyRow("cart", GREEN, "rgba(52,199,89,0.10)", "Groceries · Supermarket", "Week's run · Today", "-$42.30", RED),
      historyRow("coffee", "#8B5E3C", "rgba(139,94,60,0.12)", "Coffee · Café", "Today", "-$4.80", RED),
      historyRow("party", CARROT, "rgba(245,99,0,0.12)", "Fun · Movies", "Today", "-$12.00", RED),
    ]),
  ]),
]);

// --- the full card ---------------------------------------------------------
const tree = el("div", {
  width: W, height: H, display: "flex", position: "relative", overflow: "hidden",
  fontFamily: "Sans",
  backgroundImage: "linear-gradient(135deg, #FF9A4D 0%, #F56300 52%, #D85400 100%)",
}, [
  // soft lit corner, top-left
  el("div", { position: "absolute", top: -260, left: -200, width: 760, height: 760, borderRadius: 9999, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)" }),

  // LEFT: brand lockup + copy
  el("div", { position: "absolute", left: 84, top: 0, height: H, width: 700, display: "flex", flexDirection: "column", justifyContent: "center" }, [
    el("div", { display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 40 }, [
      el("div", { display: "flex", alignItems: "center", justifyContent: "center", width: 100, height: 100, borderRadius: 24, backgroundColor: "#FFFFFF", boxShadow: "0 10px 30px rgba(0,0,0,0.18)", marginRight: 24 }, [img(carrotUri, 82, 82)]),
      el("div", { display: "flex", flexDirection: "column", fontFamily: "Display", color: "#FFFFFF", fontSize: 64, lineHeight: 0.9, textTransform: "uppercase" }, [el("div", {}, "Bucks"), el("div", {}, "Buddy")]),
    ]),
    el("div", { display: "flex", flexDirection: "column", color: "#FFFFFF", fontWeight: 700, fontSize: 58, lineHeight: 1.04, letterSpacing: -1 }, [el("div", {}, "For wabbits"), el("div", {}, "with bad habits.")]),
    el("div", { marginTop: 20, color: "rgba(255,255,255,0.92)", fontSize: 27, lineHeight: 1.4, maxWidth: 520 }, "An on-the-go money tracker for every buck in and out, right from your pocket."),
    el("div", { display: "flex", marginTop: 34, alignSelf: "flex-start", backgroundColor: "#FFFFFF", color: CARROT, fontWeight: 700, fontSize: 25, padding: "14px 28px", borderRadius: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.16)" }, "Free · No ads · Install anywhere"),
  ]),

  // RIGHT: phone mockup of the Home screen
  phone,
]);

const svg = await satori(tree, {
  width: W, height: H,
  fonts: [
    { name: "Display", data: grobold, weight: 700, style: "normal" },
    { name: "Sans", data: sansReg, weight: 400, style: "normal" },
    { name: "Sans", data: sansBold, weight: 700, style: "normal" },
  ],
});

const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(`${ROOT}public/og-image.png`, png);
console.log("wrote public/og-image.png", png.length, "bytes");
