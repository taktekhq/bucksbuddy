// Regenerates the social-share card at public/og-image.png (1200×630).
//
// It's a one-off asset generator, not part of the app build, so its two
// dependencies are intentionally kept out of package.json. Run it with:
//
//   npm i --no-save satori @resvg/resvg-js
//   node scripts/generate-og.mjs
//
// The card mirrors the marketing landing page (src/screens/Landing.tsx): the
// carrot app icon, the Grobold "BUCKS BUDDY" wordmark, the cheeky tagline, and
// a "Free · No ads · Install anywhere" pill on the carrot-orange gradient.
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

const el = (type, style, children) => ({ type, props: { style, children } });
const img = (src, w, h) => ({ type: "img", props: { src, width: w, height: h, style: { width: w, height: h } } });

const tree = el("div", {
  width: W, height: H, display: "flex", flexDirection: "row",
  fontFamily: "Sans", position: "relative",
  backgroundImage: "linear-gradient(135deg, #FF9A4D 0%, #F56300 52%, #D85400 100%)",
}, [
  // soft lit corner, top-left — mirrors the hero
  el("div", {
    position: "absolute", top: -260, left: -200, width: 760, height: 760,
    borderRadius: 9999,
    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)",
  }),

  // LEFT: brand lockup + copy
  el("div", {
    display: "flex", flexDirection: "column", justifyContent: "center",
    width: 760, height: H, padding: "0 0 0 90px",
  }, [
    el("div", { display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 44 }, [
      el("div", {
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 112, height: 112, borderRadius: 26, backgroundColor: "#FFFFFF",
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)", marginRight: 26,
      }, [ img(carrotUri, 92, 92) ]),
      el("div", {
        display: "flex", flexDirection: "column", fontFamily: "Display",
        color: "#FFFFFF", fontSize: 72, lineHeight: 0.9, textTransform: "uppercase",
      }, [ el("div", {}, "Bucks"), el("div", {}, "Buddy") ]),
    ]),

    el("div", {
      display: "flex", flexDirection: "column", color: "#FFFFFF",
      fontFamily: "Sans", fontWeight: 700, fontSize: 68, lineHeight: 1.04, letterSpacing: -1,
    }, [ el("div", {}, "For wabbits"), el("div", {}, "with bad habits.") ]),

    el("div", {
      marginTop: 22, color: "rgba(255,255,255,0.92)", fontSize: 30, lineHeight: 1.4,
      maxWidth: 600,
    }, "An on-the-go money tracker for every buck in and out, right from your pocket."),

    el("div", {
      display: "flex", marginTop: 40, alignSelf: "flex-start",
      backgroundColor: "#FFFFFF", color: "#F56300", fontWeight: 700, fontSize: 28,
      padding: "16px 32px", borderRadius: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
    }, "Free · No ads · Install anywhere"),
  ]),

  // RIGHT: the app icon, large — a white rounded tile with the carrot
  el("div", {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 440, height: H,
  }, [
    el("div", {
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 300, height: 300, borderRadius: 68, backgroundColor: "#FFFFFF",
      boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
    }, [ img(carrotUri, 230, 230) ]),
  ]),
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
