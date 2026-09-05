module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    // Must be listed last — react-native-reanimated's own requirement.
    plugins: ["react-native-worklets/plugin"],
  };
};
