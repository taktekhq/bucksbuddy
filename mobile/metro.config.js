const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// `inlineRem: 16` matches the browser's root font size. React Native has no
// root font size, so NativeWind otherwise assumes 14 — which renders every
// rem-based class (most of Tailwind: text-*, p-*, gap-*, max-w-*) at 87.5% of
// the web's size. The web viewport is locked at initial-scale=1, so 16 is what
// the PWA actually draws.
//
// Note: this app sits inside the web app's folder, so `npx expo-doctor` reports
// the PWA's React 18 as a duplicate. Metro's project root is this directory and
// React resolves here first, and EAS uploads this directory only, so the two
// never meet in a bundle.
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
