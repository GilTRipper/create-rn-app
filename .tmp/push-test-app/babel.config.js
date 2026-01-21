module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    "react-native-worklets/plugin",
    [
      "babel-plugin-root-import",
      {
        rootPathPrefix: "~",
        rootPathSuffix: "./src",
      },
    ],
    "@babel/plugin-transform-export-namespace-from",
  ],
};
