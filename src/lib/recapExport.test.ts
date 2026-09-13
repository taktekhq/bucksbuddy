import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// jsdom draws nothing: no canvas, no image loading, no files to fetch. Every
// edge the module touches is stood in here, so the tests check the glue —
// what gets fetched, what the SVG is turned into, and where the PNG goes.

const SVG_NS = "http://www.w3.org/2000/svg";

// The font cache is a module-level promise, so any test that cares about it
// re-imports a fresh copy (the same load() pattern as posthog.test.ts).
async function load() {
  vi.resetModules();
  return import("@/lib/recapExport");
}

/** A byte pattern that differs per URL, so a swapped-up font would show. */
function bytesFor(url: string, length = 16): Uint8Array {
  const seed = url.length;
  return Uint8Array.from({ length }, (_, i) => (seed * 7 + i * 13) & 0xff);
}

function stubFetch(bodies: (url: string) => Uint8Array, ok: (url: string) => boolean = () => true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: ok(url),
      status: ok(url) ? 200 : 404,
      arrayBuffer: async () => bodies(url).buffer,
    })),
  );
}

/** Pull the base64 payload out of one `@font-face` rule and decode it. */
function decodeRule(rule: string): Uint8Array {
  const match = /url\(data:font\/woff2;base64,([^)]+)\) format\("woff2"\)/.exec(rule);
  expect(match).not.toBeNull();
  return Uint8Array.from(atob(match![1]), (c) => c.charCodeAt(0));
}

/** Split the concatenated CSS back into its rules. */
const rulesOf = (css: string) => css.split("@font-face").filter(Boolean);

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("embeddedFontCss", () => {
  it("inlines the three card fonts as base64 woff2 @font-face rules", async () => {
    stubFetch(bytesFor);
    const { embeddedFontCss } = await load();
    const css = await embeddedFontCss();
    const rules = rulesOf(css);
    expect(rules).toHaveLength(3);

    // Grobold spans the whole weight range so nothing synthesises a bolder
    // face; Nunito ships exactly the two weights the card uses.
    expect(rules[0]).toContain('font-family:"Grobold";font-weight:400 900;');
    expect(rules[1]).toContain('font-family:"Nunito";font-weight:700;');
    expect(rules[2]).toContain('font-family:"Nunito";font-weight:900;');
    for (const rule of rules) {
      expect(rule).toContain("font-style:normal;src:url(data:font/woff2;base64,");
    }
    // And the bytes come back out exactly as they went in, per file.
    expect(decodeRule(rules[0])).toEqual(bytesFor("/fonts/grobold.woff2"));
    expect(decodeRule(rules[1])).toEqual(bytesFor("/fonts/nunito-700.woff2"));
    expect(decodeRule(rules[2])).toEqual(bytesFor("/fonts/nunito-900.woff2"));
    expect(fetch).toHaveBeenCalledWith("/fonts/grobold.woff2");
    expect(fetch).toHaveBeenCalledWith("/fonts/nunito-700.woff2");
    expect(fetch).toHaveBeenCalledWith("/fonts/nunito-900.woff2");
  });

  it("fetches the files once and reuses them for every later export", async () => {
    stubFetch(bytesFor);
    const { embeddedFontCss } = await load();
    const first = embeddedFontCss();
    const second = embeddedFontCss();
    expect(second).toBe(first);
    expect(await second).toBe(await first);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("forgets a failed fetch so the next export tries again", async () => {
    let missing = true;
    stubFetch(bytesFor, (url) => !(missing && url === "/fonts/grobold.woff2"));
    const { embeddedFontCss } = await load();
    await expect(embeddedFontCss()).rejects.toThrow("font /fonts/grobold.woff2: 404");
    expect(fetch).toHaveBeenCalledTimes(3);

    // A cached rejection would leave every later export broken for the
    // session; the file being back is enough for the retry to succeed.
    missing = false;
    expect(rulesOf(await embeddedFontCss())).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("encodes a font larger than one String.fromCharCode chunk intact", async () => {
    // Real woff2 files are tens of KB; the encoder walks them 0x8000 bytes
    // at a time, so a buffer that spills past one chunk must round-trip.
    const big = bytesFor("/fonts/grobold.woff2", 0x8000 + 37);
    stubFetch((url) => (url === "/fonts/grobold.woff2" ? big : bytesFor(url)));
    const { embeddedFontCss } = await load();
    const rules = rulesOf(await embeddedFontCss());
    expect(decodeRule(rules[0])).toEqual(big);
  });
});

describe("svgToPng", () => {
  // The stand-in <img>: setting src settles onload/onerror on the next tick,
  // the way a real image does, and decode() is whatever the test says.
  type ImageOutcome = "load" | "error";
  let imageOutcome: ImageOutcome;
  let imageDecode: (() => Promise<void>) | undefined;
  let images: FakeImage[];

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decode?: () => Promise<void>;
    private source = "";
    constructor() {
      if (imageDecode) this.decode = imageDecode;
      images.push(this);
    }
    get src() {
      return this.source;
    }
    set src(value: string) {
      this.source = value;
      setTimeout(() => (imageOutcome === "load" ? this.onload?.() : this.onerror?.()), 0);
    }
  }

  let drawImage: ReturnType<typeof vi.fn>;
  let canvasSize: { width: number; height: number } | null;

  function stubCanvas(ctx: boolean, blob: Blob | null) {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvasSize = { width: this.width, height: this.height };
      return (ctx ? { drawImage } : null) as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(blob),
    );
  }

  function card(viewBox: string | null = "0 0 1080 1512") {
    const svg = document.createElementNS(SVG_NS, "svg");
    if (viewBox) svg.setAttribute("viewBox", viewBox);
    const text = document.createElementNS(SVG_NS, "text");
    text.textContent = "Spent $42";
    svg.appendChild(text);
    return svg;
  }

  /** The XML the browser was asked to draw, back out of the data: URL. */
  function drawnXml(): string {
    const prefix = "data:image/svg+xml;charset=utf-8,";
    expect(images).toHaveLength(1);
    expect(images[0].src.startsWith(prefix)).toBe(true);
    return decodeURIComponent(images[0].src.slice(prefix.length));
  }

  beforeEach(() => {
    imageOutcome = "load";
    imageDecode = undefined;
    images = [];
    drawImage = vi.fn();
    canvasSize = null;
    vi.stubGlobal("Image", FakeImage);
    stubFetch(bytesFor);
  });

  it("draws the card at the asked width, in proportion, with the fonts inlined", async () => {
    stubCanvas(true, new Blob(["png"], { type: "image/png" }));
    const { svgToPng } = await load();
    const svg = card();
    const blob = await svgToPng(svg, 540);

    expect(blob.type).toBe("image/png");
    expect(canvasSize).toEqual({ width: 540, height: 756 });
    expect(drawImage).toHaveBeenCalledWith(images[0], 0, 0, 540, 756);

    const xml = drawnXml();
    expect(xml).toContain(`xmlns="${SVG_NS}"`);
    expect(xml).toContain('width="540"');
    expect(xml).toContain('height="756"');
    expect(xml).toContain('viewBox="0 0 1080 1512"');
    // The fonts go in as the very first child so they are declared before
    // anything that uses them, and the card's own content is still there.
    expect(xml).toMatch(/^<svg[^>]*><style[^>]*>@font-face\{font-family:"Grobold"/);
    expect(xml).toContain("Spent $42");
    // The page's element is untouched: the preview must not grow a <style>.
    expect(svg.querySelector("style")).toBeNull();
    expect(svg.getAttribute("width")).toBeNull();
  });

  it("falls back to a square when the SVG carries no viewBox", async () => {
    stubCanvas(true, new Blob(["png"]));
    const { svgToPng } = await load();
    await svgToPng(card(null), 300);
    expect(canvasSize).toEqual({ width: 300, height: 300 });
  });

  it("waits for decode() where it exists, and shrugs off its failure", async () => {
    // Safari can reject decode() for an SVG it will still draw fine; that
    // must not turn a working export into an error.
    imageDecode = vi.fn(() => Promise.reject(new Error("EncodingError")));
    stubCanvas(true, new Blob(["png"]));
    const { svgToPng } = await load();
    await expect(svgToPng(card(), 540)).resolves.toBeInstanceOf(Blob);
    expect(imageDecode).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("draws straight away where decode() is missing", async () => {
    stubCanvas(true, new Blob(["png"]));
    const { svgToPng } = await load();
    await svgToPng(card(), 540);
    expect(images[0].decode).toBeUndefined();
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("rejects when the browser cannot load the image", async () => {
    imageOutcome = "error";
    stubCanvas(true, new Blob(["png"]));
    const { svgToPng } = await load();
    await expect(svgToPng(card(), 540)).rejects.toThrow("The card image could not be drawn.");
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("rejects when there is no 2d context to draw on", async () => {
    stubCanvas(false, new Blob(["png"]));
    const { svgToPng } = await load();
    await expect(svgToPng(card(), 540)).rejects.toThrow("The card image could not be drawn.");
  });

  it("rejects when the canvas cannot be read back as PNG", async () => {
    stubCanvas(true, null);
    const { svgToPng } = await load();
    await expect(svgToPng(card(), 540)).rejects.toThrow("The card image could not be saved.");
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});

describe("pngFilename", () => {
  it("names the file by month and style only", async () => {
    const { pngFilename } = await load();
    expect(pngFilename("2026-09", "card")).toBe("bucksbuddy-recap-2026-09-card.png");
  });
});

describe("deliverPng", () => {
  const blob = new Blob(["png"], { type: "image/png" });

  // jsdom has no Web Share API. These stand it in per attempt, the way iOS
  // Safari and Chrome on Android expose it: canShare answers per payload,
  // share resolves or rejects per call.
  function offerShare(
    canShare: (data: ShareData) => boolean,
    share: (data: ShareData) => Promise<void>,
  ) {
    Object.defineProperty(navigator, "canShare", { value: vi.fn(canShare), configurable: true });
    Object.defineProperty(navigator, "share", { value: vi.fn(share), configurable: true });
  }

  const isRich = (data: ShareData) => data.title !== undefined;

  /** The anchor-click spy the download goes through. */
  function spyDownload() {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    return {
      click: vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}),
      name: vi.spyOn(HTMLAnchorElement.prototype, "download", "set"),
    };
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "canShare");
    Reflect.deleteProperty(navigator, "share");
  });

  it("downloads where the browser cannot share at all", async () => {
    vi.useFakeTimers();
    const { deliverPng } = await load();
    const { click, name } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    expect(name).toHaveBeenCalledWith("recap.png");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    // The link is cleaned up after itself...
    expect(document.querySelector("a[download]")).toBeNull();
    // ...but the URL lives on long enough for Safari to finish the save.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("opens the share sheet with the image, the line and the link", async () => {
    offerShare(() => true, () => Promise.resolve());
    const { deliverPng, SHARE_TEXT, SHARE_URL } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("shared");
    expect(navigator.share).toHaveBeenCalledTimes(1);
    const data = vi.mocked(navigator.share).mock.calls[0][0] as ShareData;
    expect(data.files).toHaveLength(1);
    expect(data.files![0].name).toBe("recap.png");
    expect(data.files![0].type).toBe("image/png");
    expect(data.title).toBe(SHARE_TEXT);
    expect(data.text).toContain(SHARE_URL);
    // The browser was asked first whether it takes that payload.
    expect(navigator.canShare).toHaveBeenCalledWith(data);
    // And the download path was left alone.
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports cancelled, and downloads nothing, when the sheet is dismissed", async () => {
    offerShare(() => true, () => Promise.reject(new DOMException("closed", "AbortError")));
    const { deliverPng } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("cancelled");
    expect(navigator.share).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("retries with the image alone when the target turns down the text", async () => {
    // Some targets accept files but refuse a payload that also carries text.
    offerShare(
      () => true,
      (data) =>
        isRich(data)
          ? Promise.reject(new DOMException("refused", "NotAllowedError"))
          : Promise.resolve(),
    );
    const { deliverPng } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("shared");
    expect(navigator.share).toHaveBeenCalledTimes(2);
    const second = vi.mocked(navigator.share).mock.calls[1][0] as ShareData;
    expect(Object.keys(second)).toEqual(["files"]);
    expect(second.files).toHaveLength(1);
    expect(click).not.toHaveBeenCalled();
  });

  it("skips straight to the image alone when the browser cannot share the text", async () => {
    offerShare((data) => !isRich(data), () => Promise.resolve());
    const { deliverPng } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("shared");
    expect(navigator.canShare).toHaveBeenCalledTimes(2);
    expect(navigator.share).toHaveBeenCalledTimes(1);
    const only = vi.mocked(navigator.share).mock.calls[0][0] as ShareData;
    expect(Object.keys(only)).toEqual(["files"]);
    expect(click).not.toHaveBeenCalled();
  });

  it("downloads when every share attempt is refused", async () => {
    offerShare(() => true, () => Promise.reject(new DOMException("refused", "NotAllowedError")));
    const { deliverPng } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("downloaded");
    expect(navigator.share).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads when sharing fails for any other reason", async () => {
    // A plain Error is not a dismissal, so the user still gets the file.
    offerShare(() => true, () => Promise.reject(new Error("boom")));
    const { deliverPng } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads without opening the sheet when the browser can share nothing", async () => {
    offerShare(() => false, () => Promise.resolve());
    const { deliverPng } = await load();
    const { click } = spyDownload();

    await expect(deliverPng(blob, "recap.png")).resolves.toBe("downloaded");
    expect(navigator.canShare).toHaveBeenCalledTimes(2);
    expect(navigator.share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });
});
