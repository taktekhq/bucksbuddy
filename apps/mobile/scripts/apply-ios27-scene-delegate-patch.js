#!/usr/bin/env node
// Stopgap for iOS 27's new hard UIScene-lifecycle requirement — see
// docs/EXPO_MIGRATION.md ("Sidebar: iOS 27's UIScene requirement broke the
// freshly-built dev client"). Already fixed on Expo's main branch
// (expo/expo#46733) but not yet in a published SDK 57 release, so this
// vendors the same two files by hand into the installed `expo` package,
// where its own podspec's `ios/**/*.swift` glob picks them up on the next
// `pod install`. Runs as a postinstall step (see the root package.json)
// because node_modules is never committed, so this has to be re-applied
// after every `npm install`.
//
// Paired with plugins/withIOS27SceneLifecycle.js, which makes the generated
// AppDelegate.swift/Info.plist actually use what this vendors in.
//
// Remove this whole stopgap — this script, the plugin, patches/, and the
// postinstall line — once `expo` publishes a release containing #46733.
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_DIR = path.join(__dirname, "..", "patches", "ios27-scene-delegate");
const DEST_DIR = path.join(__dirname, "..", "node_modules", "expo", "ios", "AppDelegates");

if (!fs.existsSync(DEST_DIR)) {
  // expo isn't installed yet (e.g. a bare `npm install` at the repo root
  // before workspaces are hoisted) — nothing to patch yet, not an error.
  process.exit(0);
}

for (const file of fs.readdirSync(SOURCE_DIR)) {
  fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(DEST_DIR, file));
  console.log(`[ios27-scene-delegate patch] vendored ${file} into expo/ios/AppDelegates/`);
}
