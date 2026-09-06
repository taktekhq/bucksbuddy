/// <reference types="nativewind/types" />

// `import "../global.css"` in App.tsx is a build-time side effect (Metro
// compiles the stylesheet into the bundle); TypeScript needs to be told the
// module exists.
declare module "*.css";
