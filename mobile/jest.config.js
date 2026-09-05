// Mirrors the web's vitest setup (see ../vitest.config.ts): colocated
// *.test.ts(x) beside the source, and a hard 100% coverage gate. The preset is
// jest-expo, which knows how to transform React Native and the Expo modules.
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // lucide-react-native (and the noble crypto packages) ship ESM, which jest
  // must transform rather than skip along with the rest of node_modules.
  transformIgnorePatterns: [
    "node_modules/(?!(?:jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lucide-react-native|nativewind|react-native-css-interop|@noble/.*)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // The package's "react-native" export condition points at an .mjs bundle,
    // which jest's default transform doesn't touch. Its CommonJS build is the
    // same icons.
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    // Bootstrap, types and the harness itself have no testable logic — the
    // same exclusions the web makes.
    "!src/App.tsx",
    "!src/types/**",
    "!src/test/**",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.d.ts",
  ],
  coverageReporters: ["text", "text-summary", "html"],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
