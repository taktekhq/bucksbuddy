import { useEffect } from "react";

// Drives the <meta name="theme-color">, which iOS (16.4+) standalone PWAs and
// Android use to tint the status-bar / address-bar area (the bit near the time
// and battery). Each screen declares its top color; we restore the previous
// value on unmount so screens that don't set one keep the app default.
export function useThemeColor(color: string) {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", color);
    return () => {
      if (prev !== null) meta!.setAttribute("content", prev);
    };
  }, [color]);
}
