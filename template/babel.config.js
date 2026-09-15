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
    // intl-messageformat (via i18next-icu) ships static class blocks, which
    // the RN preset does not transform. Metro fails to bundle without this.
    "@babel/plugin-transform-class-static-block",
    "react-native-worklets/plugin",
  ],
};
