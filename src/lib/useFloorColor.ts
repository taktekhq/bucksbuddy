import { useEffect } from "react";

// Paints the document itself — <html> and <body> — in a dark page's floor
// color for as long as the page is mounted, restoring what was there on
// unmount. The dark pages already draw a fixed full-viewport floor behind
// their content; this is the belt to that's braces. Anything the browser
// exposes beyond that layer (the strip under a collapsing toolbar, the
// home-indicator inset on a standalone iOS app, an overscroll bounce) shows
// the document's own background, and by default that is the light canvas.
//
// Both elements get the color: painting <html> alone would stop <body>'s
// background from propagating to the canvas, and body would then paint its
// light canvas over the page's z-index:-1 floor (see index.css).
//
// Pass null to leave the document alone — for a floor that only applies while
// something is on screen (the category sheet paints one while it's open).
export function useFloorColor(color: string | null) {
  useEffect(() => {
    if (color === null) return;
    const html = document.documentElement.style;
    const body = document.body.style;
    const prev = { html: html.background, body: body.background };
    html.background = color;
    body.background = color;
    return () => {
      html.background = prev.html;
      body.background = prev.body;
    };
  }, [color]);
}
