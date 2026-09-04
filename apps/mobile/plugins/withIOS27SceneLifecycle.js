// Stopgap for iOS 27's new hard UIScene-lifecycle requirement — see
// docs/EXPO_MIGRATION.md ("Sidebar: iOS 27's UIScene requirement broke the
// freshly-built dev client"). Already fixed on Expo's main branch
// (expo/expo#46733) but not yet in a published SDK 57 release.
//
// Runs on every `expo prebuild`, since apps/mobile/ios is fully regenerated
// (and git-ignored) rather than hand-maintained. Pairs with
// scripts/apply-ios27-scene-delegate-patch.js, which vendors the scene
// delegate classes this references into node_modules/expo.
//
// Remove this whole stopgap — this plugin, the vendoring script, patches/,
// and app.json's reference to it — once `expo` publishes a release
// containing #46733.
const { withAppDelegate, withInfoPlist } = require("@expo/config-plugins");

const WINDOW_CREATION_BLOCK = `
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(
      `withIOS27SceneLifecycle: expected to find ${label} in the generated AppDelegate.swift, ` +
        "but it wasn't there — Expo's template likely changed shape. Check whether " +
        "expo/expo#46733 has shipped in a published SDK release yet; if so, this whole " +
        "plugin can be deleted instead of patched.",
    );
  }
  return source.replace(search, replacement);
}

function withIOS27SceneLifecycle(config) {
  config = withAppDelegate(config, (config) => {
    let { contents } = config.modResults;

    contents = replaceOrThrow(
      contents,
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      "the AppDelegate class declaration",
    );
    // The scene delegate (ExpoAppSceneDelegate, vendored into node_modules)
    // creates the window and starts React Native into it now — see its
    // doc comment for why the app delegate can't do both jobs anymore.
    contents = replaceOrThrow(contents, WINDOW_CREATION_BLOCK, "\n", "the direct window-creation block");

    config.modResults.contents = contents;
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        // EXExpoAppSceneDelegate is the vendored ExpoAppSceneDelegate's
        // @objc runtime name — see patches/ios27-scene-delegate.
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return config;
  });

  return config;
}

module.exports = withIOS27SceneLifecycle;
