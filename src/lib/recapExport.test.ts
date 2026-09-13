import { beforeEach, expect, it, vi } from "vitest";
import {
  renderRecapPng,
  shareRecap,
  downloadRecap,
  recapFilename,
  trackRecap,
} from "./recapExport";
const { rasterize, capture } = vi.hoisted(() => ({
  rasterize: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("html2canvas", () => ({ default: rasterize }));
vi.mock("./posthog", () => ({ default: { capture } }));
const context = { style: "trading", period: "past" } as const;
const file = new File(["pixels"], recapFilename("2025-12", "trading"), {
  type: "image/png",
});
const canShare = vi.fn();
const share = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: canShare,
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  canShare.mockReturnValue(true);
  share.mockResolvedValue(undefined);
});
it("waits for local fonts and rasterizes just the card at 1080px, or fails closed", async () => {
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load, ready: Promise.resolve() },
  });
  const node = document.createElement("article");
  Object.defineProperties(node, {
    offsetWidth: { value: 370 },
    offsetHeight: { value: 740 },
  });
  const blob = new Blob(["png"]);
  rasterize
    .mockResolvedValueOnce({
      toBlob: (done: (blob: Blob | null) => void) => done(blob),
    })
    .mockResolvedValueOnce({
      toBlob: (done: (blob: Blob | null) => void) => done(null),
    });
  expect(await renderRecapPng(node)).toBe(blob);
  expect(load).toHaveBeenCalledTimes(3);
  expect(rasterize).toHaveBeenCalledWith(
    node,
    expect.objectContaining({
      width: 370,
      height: 740,
      scale: 1080 / 370,
      backgroundColor: "#faf7ed",
    }),
  );
  await expect(renderRecapPng(node)).rejects.toThrow("png_failed");
});
it("shares a ready PNG synchronously with bounded attribution, never reporting recipient delivery", async () => {
  const pending = shareRecap(file, context, false);
  expect(share).toHaveBeenCalledWith({
    files: [file],
    text: "My month, in BucksBuddy.",
    url: "https://www.bucksbuddy.com/?utm_source=recap&utm_medium=share&utm_campaign=recap_v1",
  });
  expect(await pending).toBe("resolved");
  expect(capture.mock.calls.map((c) => c[0])).toEqual([
    "recap_share_invoked",
    "recap_share_resolved",
  ]);
});
it("supports a fresh PNG-only gesture after a rejection", async () => {
  share.mockRejectedValueOnce(new Error("destination rejected"));
  expect(await shareRecap(file, context, false)).toBe("rejected");
  expect(await shareRecap(file, context, true)).toBe("resolved");
  expect(share).toHaveBeenLastCalledWith({ files: [file] });
  expect(JSON.stringify(capture.mock.calls)).not.toContain(
    "destination rejected",
  );
});
it("treats cancellation neutrally and capability exceptions as rejected", async () => {
  share.mockRejectedValueOnce(new DOMException("cancel", "AbortError"));
  expect(await shareRecap(file, context, false)).toBe("cancelled");
  expect(capture).toHaveBeenLastCalledWith("recap_share_cancelled", {
    ...context,
    stage: "share",
  });
  share.mockRejectedValueOnce("opaque");
  expect(await shareRecap(file, context, false)).toBe("rejected");
  canShare.mockImplementationOnce(() => {
    throw new Error("unsupported");
  });
  expect(await shareRecap(file, context, false)).toBe("rejected");
});
it("uses file-sharing support as the gate, falling back to downloads", async () => {
  canShare.mockReturnValueOnce(false);
  expect(await shareRecap(file, context, false)).toBe("download");
  Object.defineProperty(navigator, "canShare", { value: undefined });
  expect(await shareRecap(file, context, false)).toBe("download");
  expect(share).not.toHaveBeenCalled();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("bucksbuddy-recap-2025-12-monthly.png");
      expect(this.href).toBe("blob:preview");
      expect(this.isConnected).toBe(true);
    });
  downloadRecap("blob:preview", recapFilename("2025-12", "monthly"));
  expect(document.querySelector("a[download]")).toBeNull();
  click.mockRestore();
});
it("whitelists analytics properties", () => {
  trackRecap(
    "recap_opened",
    { ...context, name: "SECRET", cents: 123 } as typeof context,
    "open",
  );
  expect(capture).toHaveBeenCalledWith("recap_opened", {
    style: "trading",
    period: "past",
    stage: "open",
  });
});
