// Turning the Recap SVG into a PNG on the device, and handing it over.
//
// The card is an inline <svg> in the page. To export it we serialize that
// same element (so the PNG is exactly the preview), embed the card's fonts
// as data URIs (an SVG drawn as an image can't load external files, and a
// friend's phone shouldn't get a different font anyway), draw it on a canvas
// and read the canvas back as PNG bytes. Nothing leaves the device.

const SVG_NS = "http://www.w3.org/2000/svg";

export const SHARE_TEXT = "My month, in BucksBuddy.";
export const SHARE_URL =
  "https://www.bucksbuddy.com/?utm_source=recap&utm_medium=share&utm_campaign=recap_v1";

/** "BEAN COUNTER. My September 2026 on BucksBuddy." — never a name or an amount. */
export function shareTextFor(title: string, monthName: string): string {
  return `${title} My ${monthName} on BucksBuddy.`;
}

// The fonts a card can use. Grobold is declared across the whole weight range
// (it ships one weight, and nothing must fake a bolder one — see index.css);
// Nunito ships the two weights the card sets.
const FONTS = [
  { family: "Grobold", weight: "400 900", url: "/fonts/grobold.woff2" },
  { family: "Nunito", weight: "700", url: "/fonts/nunito-700.woff2" },
  { family: "Nunito", weight: "900", url: "/fonts/nunito-900.woff2" },
];

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Fetched once per session and kept: the same three files go into every
// export. A failed fetch forgets the attempt so the next export retries.
let fontCss: Promise<string> | null = null;

/** `@font-face` rules with the card's fonts inlined as base64 woff2. */
export function embeddedFontCss(): Promise<string> {
  if (!fontCss) {
    fontCss = Promise.all(
      FONTS.map(async (font) => {
        const res = await fetch(font.url);
        if (!res.ok) throw new Error(`font ${font.url}: ${res.status}`);
        const data = toBase64(await res.arrayBuffer());
        return (
          `@font-face{font-family:"${font.family}";font-weight:${font.weight};` +
          `font-style:normal;src:url(data:font/woff2;base64,${data}) format("woff2")}`
        );
      }),
    )
      .then((rules) => rules.join(""))
      .catch((err: unknown) => {
        fontCss = null;
        throw err;
      });
  }
  return fontCss;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The card image could not be drawn."));
    img.src = src;
  });
}

/**
 * Rasterize `svg` (which must carry a viewBox) at `width` px wide, height in
 * proportion. Resolves with PNG bytes as a Blob.
 */
export async function svgToPng(svg: SVGSVGElement, width: number): Promise<Blob> {
  const viewBox = (svg.getAttribute("viewBox") ?? "0 0 1 1").split(/\s+/).map(Number);
  const height = Math.round((width * viewBox[3]) / viewBox[2]);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = await embeddedFontCss();
  clone.insertBefore(style, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  // A data: URL rather than a blob: one — Safari applies fonts embedded in an
  // SVG image far more reliably that way, and there's nothing to revoke.
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
  // Where supported, wait for the SVG (and its fonts) to be fully decoded
  // before the draw; otherwise the first paint can miss the embedded fonts.
  if (typeof img.decode === "function") await img.decode().catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The card image could not be drawn.");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The card image could not be saved.");
  return blob;
}

/** "bucksbuddy-recap-2026-09-card.png" — no name, no amounts, nothing personal. */
export function pngFilename(monthKey: string, style: string): string {
  return `bucksbuddy-recap-${monthKey}-${style}.png`;
}

/** Save the PNG the plain way: a download link, clicked. */
export function downloadPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari consumes the URL after the click returns, so give it a moment
  // before revoking (an immediate revoke can quietly cancel the save).
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type Delivery = "shared" | "downloaded" | "cancelled";

/**
 * Hand the PNG over the way this device does it best. Where the browser can
 * share files (iOS Safari and the installed PWA, Chrome on Android) the OS
 * share sheet opens — the image plus the share line and link where the
 * target takes them, the image alone where it doesn't. Everywhere else, and
 * whenever a target turns the file down, it's a download.
 *
 * Call it synchronously from the tap: the share sheet only opens inside the
 * user gesture that asked for it. Closing the sheet without picking a target
 * resolves "cancelled" — nothing went anywhere, and that's not an error.
 * `text` is the line that travels with the image where the target takes one.
 */
export async function deliverPng(
  blob: Blob,
  filename: string,
  text = SHARE_TEXT,
): Promise<Delivery> {
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.canShare === "function") {
    const attempts: ShareData[] = [
      { files: [file], title: SHARE_TEXT, text: `${text} ${SHARE_URL}` },
      { files: [file] },
    ];
    for (const data of attempts) {
      if (!navigator.canShare(data)) continue;
      try {
        await navigator.share(data);
        return "shared";
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
        // The target refused this shape of payload; try the plainer one.
      }
    }
  }
  downloadPng(blob, filename);
  return "downloaded";
}
