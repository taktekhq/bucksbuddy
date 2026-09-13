import html2canvas from "html2canvas";
import posthog from "./posthog";
import type { RecapStyle } from "./recap";

export type RecapEvent =
  | "recap_opened"
  | "recap_export_succeeded"
  | "recap_share_invoked"
  | "recap_share_resolved"
  | "recap_share_cancelled"
  | "recap_failed";
export type RecapContext = { style: RecapStyle; period: "current" | "past" };
export function trackRecap(
  event: RecapEvent,
  context: RecapContext,
  stage: "open" | "load" | "render" | "download" | "share",
) {
  // Construct an allowlist object; never spread data supplied by callers.
  posthog.capture(event, {
    style: context.style,
    period: context.period,
    stage,
  });
}

export async function renderRecapPng(node: HTMLElement): Promise<Blob> {
  await Promise.all([
    document.fonts.load('500 43px "Bricolage Grotesque"'),
    document.fonts.load('400 15px "DM Sans"'),
    document.fonts.load('500 15px "DM Sans"'),
  ]);
  await document.fonts.ready;
  const canvas = await html2canvas(node, {
    scale: 1080 / node.offsetWidth,
    width: node.offsetWidth,
    height: node.offsetHeight,
    backgroundColor: "#faf7ed",
    logging: false,
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("png_failed");
  return blob;
}

export function recapFilename(month: string, style: RecapStyle): string {
  return `bucksbuddy-recap-${month}-${style}.png`;
}

export function downloadRecap(url: string, filename: string) {
  // The preview owns this URL until settings change or the screen closes, so
  // Safari has time to consume it after the click.
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function shareRecap(
  file: File,
  context: RecapContext,
  pngOnly: boolean,
): Promise<"download" | "cancelled" | "resolved" | "rejected"> {
  try {
    if (
      typeof navigator.canShare !== "function" ||
      !navigator.canShare({ files: [file] })
    )
      return "download";
    trackRecap("recap_share_invoked", context, "share");
    // No await before navigator.share: retain the tap's transient activation.
    await navigator.share(
      pngOnly
        ? { files: [file] }
        : {
            files: [file],
            text: "My month, in BucksBuddy.",
            url: "https://www.bucksbuddy.com/?utm_source=recap&utm_medium=share&utm_campaign=recap_v1",
          },
    );
    trackRecap("recap_share_resolved", context, "share");
    return "resolved";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      trackRecap("recap_share_cancelled", context, "share");
      return "cancelled";
    }
    trackRecap("recap_failed", context, "share");
    return "rejected";
  }
}
