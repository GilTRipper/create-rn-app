module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    [
      "babel-plugin-root-import",
      {
        rootPathPrefix: "~",
        rootPathSuffix: "./src",
      },
    ],
    "@babel/plugin-transform-export-namespace-from",
    "react-native-worklets/plugin",
  ],
};
